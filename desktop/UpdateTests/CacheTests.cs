using GenshinPlanner;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;

internal static class CacheTests
{
    private sealed class Handler : HttpMessageHandler
    {
        public int Requests;
        public Func<HttpRequestMessage, HttpResponseMessage> Reply = _ => throw new HttpRequestException("offline");
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests++;
            return Task.FromResult(Reply(request));
        }
    }
    private static void Require(bool value, string message) { if (!value) throw new Exception(message); }
    private static HttpResponseMessage Response(string text, string? tag = null)
    {
        var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(text) };
        if (tag is not null) response.Headers.ETag = new EntityTagHeaderValue(tag);
        response.Content.Headers.LastModified = DateTimeOffset.Parse("2026-11-25T00:00:00Z");
        return response;
    }
    internal static async Task RunAsync(string root)
    {
        var cache = new ResourceCache();
        var file = Path.Combine(root, "cache", "data.json");
        var handler = new Handler();
        using var http = new HttpClient(handler);
        bool Valid(string text) { using var doc = JsonDocument.Parse(text); return doc.RootElement.ValueKind == JsonValueKind.Object; }
        Task<ResourceCache.Result> Read(string mode) => cache.ReadAsync(http, "https://example.test/data", file, mode, TimeSpan.FromHours(12), Valid);
        handler.Reply = _ => Response("{\"value\":1}", "\"a\"");
        Require((await Read("prefer")).Source == "network", "Missing cache must download");
        var writes = File.GetLastWriteTimeUtc(file);
        Require((await Read("local")).Content == "{\"value\":1}" && handler.Requests == 1, "Local read must avoid HTTP");
        Require((await Read("prefer")).Source == "cache" && handler.Requests == 1, "Prefer cache must avoid HTTP");
        handler.Reply = request =>
        {
            Require(request.Headers.IfNoneMatch.Any(t => t.Tag == "\"a\""), "ETag conditional request missing");
            Require(request.Headers.IfModifiedSince.HasValue, "Last-Modified conditional request missing");
            return new HttpResponseMessage(HttpStatusCode.NotModified);
        };
        Require((await Read("check")).Source == "not-modified", "304 must reuse cache");
        Require(File.GetLastWriteTimeUtc(file) == writes, "304 must not rewrite content");
        handler.Reply = _ => Response("{\"value\":1}");
        Require((await Read("check")).Source == "not-modified", "Equal content must use hash fallback");
        Require(File.GetLastWriteTimeUtc(file) == writes, "Equal content must not rewrite cache");
        handler.Reply = _ => Response("{\"value\":2}", "\"b\"");
        Require((await Read("check")).Source == "network", "Changed data must replace cache");
        handler.Reply = _ => throw new HttpRequestException("offline");
        Require((await Read("check")).Source == "stale-cache" && (await Read("local")).Content == "{\"value\":2}", "Offline must preserve last valid content");
        handler.Reply = _ => Response("invalid json");
        Require((await Read("check")).Source == "stale-cache", "Invalid response must preserve cache");
        await File.WriteAllTextAsync(file, "{\"value\":3}");
        handler.Reply = request =>
        {
            Require(!request.Headers.IfNoneMatch.Any() && !request.Headers.IfModifiedSince.HasValue, "Mismatched metadata must not be reused");
            return Response("{\"value\":4}");
        };
        Require((await Read("check")).Content == "{\"value\":4}", "Mismatched cache must be checked");
        await File.WriteAllTextAsync(file, "invalid");
        handler.Reply = _ => Response("{\"value\":5}");
        Require((await Read("prefer")).Content == "{\"value\":5}", "Invalid local data must be repaired");
        Console.WriteLine("Resource cache tests passed.");
    }
}
