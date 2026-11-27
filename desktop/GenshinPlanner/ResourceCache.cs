using System.Collections.Concurrent;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace GenshinPlanner;

internal sealed class ResourceCache
{
    internal sealed record Result(string Content, string Source, string Hash);
    private sealed record Metadata(string Hash, string? ETag, DateTimeOffset? LastModified, DateTimeOffset CheckedAt);
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _gates = new(StringComparer.OrdinalIgnoreCase);

    private static string Hash(string text) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant();

    private static async Task WriteAtomicAsync(string path, string content)
    {
        var temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            await File.WriteAllTextAsync(temp, content);
            File.Move(temp, path, true);
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }

    internal async Task<Result> ReadAsync(HttpClient http, string url, string file, string mode, TimeSpan age, Func<string, bool> valid)
    {
        if (mode is not ("local" or "prefer" or "check" or "normal")) throw new ArgumentException("缓存读取方式无效。");
        var gate = _gates.GetOrAdd(file, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync();
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            string? cached = null, hash = null;
            Metadata? meta = null;
            var metaFile = file + ".meta";
            if (File.Exists(file))
            {
                try
                {
                    var text = await File.ReadAllTextAsync(file);
                    if (valid(text)) { cached = text; hash = Hash(text); }
                }
                catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException or InvalidDataException) { }
            }
            if (cached is not null && File.Exists(metaFile))
            {
                try
                {
                    meta = JsonSerializer.Deserialize<Metadata>(await File.ReadAllTextAsync(metaFile));
                    if (meta?.Hash != hash) meta = null;
                }
                catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException) { }
            }
            if (mode == "local")
                return cached is not null ? new(cached, "cache", hash!) : throw new FileNotFoundException("本地资料缓存缺失或无效。", file);
            var checkedAt = meta?.CheckedAt ?? (cached is not null ? new DateTimeOffset(File.GetLastWriteTimeUtc(file)) : DateTimeOffset.MinValue);
            if (cached is not null && (mode == "prefer" || (mode == "normal" && DateTimeOffset.UtcNow - checkedAt < age)))
                return new(cached, "cache", hash!);
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                if (cached is not null && meta is not null)
                {
                    if (EntityTagHeaderValue.TryParse(meta.ETag, out var tag)) request.Headers.IfNoneMatch.Add(tag);
                    if (meta.LastModified is DateTimeOffset modified) request.Headers.IfModifiedSince = modified;
                }
                using var response = await http.SendAsync(request);
                if (response.StatusCode == HttpStatusCode.NotModified)
                {
                    if (cached is null || meta is null) throw new InvalidDataException("服务器返回 304，但本地缓存不可用。");
                    await WriteAtomicAsync(metaFile, JsonSerializer.Serialize(meta with {
                        ETag = response.Headers.ETag?.ToString() ?? meta.ETag,
                        LastModified = response.Content.Headers.LastModified ?? meta.LastModified,
                        CheckedAt = DateTimeOffset.UtcNow
                    }));
                    return new(cached, "not-modified", hash!);
                }
                response.EnsureSuccessStatusCode();
                var content = await response.Content.ReadAsStringAsync();
                if (!valid(content)) throw new InvalidDataException("远程资料格式无效。");
                var nextHash = Hash(content);
                var changed = hash != nextHash;
                if (changed) await WriteAtomicAsync(file, content);
                await WriteAtomicAsync(metaFile, JsonSerializer.Serialize(new Metadata(nextHash,
                    response.Headers.ETag?.ToString(), response.Content.Headers.LastModified, DateTimeOffset.UtcNow)));
                return new(content, changed ? "network" : "not-modified", nextHash);
            }
            catch (Exception e) when (cached is not null && (e is HttpRequestException or TaskCanceledException or IOException or JsonException or UnauthorizedAccessException or InvalidDataException))
            {
                return new(cached, "stale-cache", hash!);
            }
        }
        finally { gate.Release(); }
    }
}
