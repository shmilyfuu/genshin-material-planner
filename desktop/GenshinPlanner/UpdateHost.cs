using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace GenshinPlanner;

internal sealed class UpdateHost
{
    private const string Repository = "shmilyfuu/genshin-material-planner";
    private const string ExeName = "GenshinPlanner.exe";
    private const string StagePrefix = ".planner-update-";
    private const long MaxPackageSize = 512L * 1024 * 1024;
    private const long MaxExtractSize = 1024L * 1024 * 1024;
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromMinutes(5) };
    private static readonly Regex TagPattern = new(@"^desktop-v(\d+\.\d+\.\d+)$", RegexOptions.CultureInvariant);
    private static readonly Regex StagePattern = new(@"^\.planner-update-[0-9a-f]{32}$", RegexOptions.CultureInvariant);
    private Release? _candidate;
    private bool _preparing;

    private sealed record Release(Version Version, string ZipUrl, string HashUrl, long Size, string Notes);

    static UpdateHost()
    {
        Http.DefaultRequestHeaders.UserAgent.ParseAdd("GenshinPlanner/desktop-updater");
        Http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
    }

    internal static Version CurrentVersion
    {
        get
        {
            var version = Assembly.GetEntryAssembly()?.GetName().Version ?? new Version(0, 0, 0);
            return new Version(version.Major, version.Minor, Math.Max(0, version.Build));
        }
    }

    public async Task<object> CheckAsync()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        using var response = await Http.GetAsync("https://api.github.com/repos/" + Repository + "/releases/latest", timeout.Token);
        response.EnsureSuccessStatusCode();
        var release = JsonNode.Parse(await response.Content.ReadAsStringAsync(timeout.Token)) as JsonObject
            ?? throw new InvalidDataException("更新信息格式无效。");
        _candidate = ParseRelease(release, CurrentVersion);
        return new
        {
            current = CurrentVersion.ToString(),
            available = _candidate is not null,
            latest = _candidate?.Version.ToString(),
            notes = _candidate?.Notes
        };
    }

    private static Release? ParseRelease(JsonObject release, Version current)
    {
        if (release["draft"]?.GetValue<bool>() != false || release["prerelease"]?.GetValue<bool>() != false)
            return null;
        var tag = release["tag_name"]?.GetValue<string>() ?? "";
        var match = TagPattern.Match(tag);
        if (!match.Success || !Version.TryParse(match.Groups[1].Value, out var version) || version <= current)
            return null;
        var filename = $"GenshinPlanner-WebView2-v{version}-win-x64.zip";
        var assets = release["assets"] as JsonArray ?? throw new InvalidDataException("更新文件列表缺失。");
        JsonNode FindAsset(string name) =>
            assets.SingleOrDefault(a => a?["name"]?.GetValue<string>() == name)
            ?? throw new InvalidDataException("更新文件缺失：" + name);
        string AssetUrl(JsonNode asset, string name)
        {
            var expected = $"https://github.com/{Repository}/releases/download/{tag}/{name}";
            if (asset["browser_download_url"]?.GetValue<string>() != expected)
                throw new InvalidDataException("更新文件地址无效。");
            return expected;
        }
        var zip = FindAsset(filename);
        var checksum = FindAsset(filename + ".sha256");
        long size = zip["size"]?.GetValue<long>() ?? 0;
        if (size <= 0 || size > MaxPackageSize)
            throw new InvalidDataException("更新包大小超出范围。");
        var notes = release["body"]?.GetValue<string>() ?? "";
        return new Release(version, AssetUrl(zip, filename), AssetUrl(checksum, filename + ".sha256"),
            size, notes[..Math.Min(notes.Length, 12000)]);
    }

    private static async Task DownloadAsync(string url, string path, long limit, CancellationToken token)
    {
        using var response = await Http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, token);
        response.EnsureSuccessStatusCode();
        if (response.RequestMessage?.RequestUri?.Scheme != Uri.UriSchemeHttps)
            throw new InvalidDataException("更新下载必须使用 HTTPS。");
        if (response.Content.Headers.ContentLength is long size && size > limit)
            throw new InvalidDataException("更新文件大小超出范围。");
        await using var source = await response.Content.ReadAsStreamAsync(token);
        await using var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true);
        byte[] buffer = new byte[65536];
        long total = 0;
        int count;
        while ((count = await source.ReadAsync(buffer, token)) > 0)
        {
            total += count;
            if (total > limit) throw new InvalidDataException("更新文件大小超出范围。");
            await output.WriteAsync(buffer.AsMemory(0, count), token);
        }
    }

    public async Task<bool> PrepareAsync(string requestedVersion)
    {
        if (_preparing) throw new InvalidOperationException("更新正在准备。");
        var release = _candidate;
        if (release is null || release.Version.ToString() != requestedVersion || release.Version <= CurrentVersion)
            throw new InvalidOperationException("请重新检查更新。");
        var root = Path.GetFullPath(AppContext.BaseDirectory);
        var exe = Path.Combine(root, ExeName);
        if (!SamePath(Environment.ProcessPath ?? "", exe))
            throw new InvalidOperationException("请从正式便携版程序启动更新。");
        _preparing = true;
        var stage = Path.Combine(root, StagePrefix + Guid.NewGuid().ToString("N"));
        bool handedOff = false;
        try
        {
            Directory.CreateDirectory(stage);
            using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(5));
            var package = Path.Combine(stage, "package.zip");
            var checksum = Path.Combine(stage, "package.sha256");
            await DownloadAsync(release.HashUrl, checksum, 1024, timeout.Token);
            var expected = (await File.ReadAllTextAsync(checksum, timeout.Token)).Trim();
            if (!Regex.IsMatch(expected, @"^[0-9a-fA-F]{64}$"))
                throw new InvalidDataException("SHA256 校验文件格式无效。");
            await DownloadAsync(release.ZipUrl, package, Math.Min(release.Size, MaxPackageSize), timeout.Token);
            if (new FileInfo(package).Length != release.Size)
                throw new InvalidDataException("更新包下载不完整。");
            await using (var stream = File.OpenRead(package))
            {
                var actual = Convert.ToHexString(await SHA256.HashDataAsync(stream, timeout.Token));
                if (!actual.Equals(expected, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("更新包 SHA256 校验失败。");
            }
            var payload = Path.Combine(stage, "payload");
            await Task.Run(() => ExtractPackage(package, payload), timeout.Token);
            var published = FileVersionInfo.GetVersionInfo(Path.Combine(payload, ExeName));
            if (published.FileMajorPart != release.Version.Major || published.FileMinorPart != release.Version.Minor
                || published.FileBuildPart != release.Version.Build)
                throw new InvalidDataException("更新包程序版本与发布版本不符。");
            File.Delete(package);
            File.Delete(checksum);
            var helper = Path.Combine(stage, "helper.exe");
            File.Copy(exe, helper, false);
            var info = new ProcessStartInfo(helper) { UseShellExecute = false, WorkingDirectory = stage };
            info.ArgumentList.Add("--apply-update");
            info.ArgumentList.Add(Environment.ProcessId.ToString(System.Globalization.CultureInfo.InvariantCulture));
            using var process = Process.Start(info) ?? throw new InvalidOperationException("无法启动更新进程。");
            handedOff = true;
            return true;
        }
        finally
        {
            _preparing = false;
            if (!handedOff) TryDelete(stage);
        }
    }

    internal static void ExtractPackage(string package, string destination)
    {
        Directory.CreateDirectory(destination);
        using var archive = ZipFile.OpenRead(package);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        long size = 0;
        foreach (var entry in archive.Entries)
        {
            var name = entry.FullName.Replace('\\', '/');
            if (name == "data/" && entry.Length == 0) continue;
            bool directory = name.EndsWith('/');
            var parts = name.TrimEnd('/').Split('/');
            if (parts.Any(s => s.Length == 0 || s is "." or ".." || s.EndsWith('.') || s.EndsWith(' ')
                || s.Any(c => char.IsControl(c) || ":*?\"<>|".Contains(c))))
                throw new InvalidDataException("更新包包含无效路径。");
            bool allowed = (!directory && name == ExeName)
                || (directory && (name == "resources/" || name == "resources/wwwroot/"))
                || name.StartsWith("resources/wwwroot/", StringComparison.Ordinal);
            if (!allowed || !seen.Add(string.Join("/", parts)) || ((uint)entry.ExternalAttributes & 0xF0000000u) == 0xA0000000u)
                throw new InvalidDataException("更新包包含不允许的文件。");
            size += entry.Length;
            if (size > MaxExtractSize || seen.Count > 20000)
                throw new InvalidDataException("更新包解压大小超出范围。");
            var target = Path.GetFullPath(Path.Combine(destination, Path.Combine(parts)));
            if (!target.StartsWith(Path.TrimEndingDirectorySeparator(Path.GetFullPath(destination)) + Path.DirectorySeparatorChar,
                StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("更新文件路径超出范围。");
            if (directory) Directory.CreateDirectory(target);
            else
            {
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                entry.ExtractToFile(target, false);
            }
        }
        if (!File.Exists(Path.Combine(destination, ExeName))
            || !File.Exists(Path.Combine(destination, "resources", "wwwroot", "index.html"))
            || !File.Exists(Path.Combine(destination, "resources", "wwwroot", "desktop-app.mjs")))
            throw new InvalidDataException("更新包缺少程序或界面资源。");
    }

    private static bool SamePath(string a, string b) =>
        string.Equals(Path.GetFullPath(a), Path.GetFullPath(b), StringComparison.OrdinalIgnoreCase);

    internal static string ValidateStage(string root, string name)
    {
        if (!StagePattern.IsMatch(name)) throw new InvalidDataException("更新目录无效。");
        var stage = Path.Combine(root, name);
        if (!Directory.Exists(stage) || (File.GetAttributes(stage) & FileAttributes.ReparsePoint) != 0)
            throw new InvalidDataException("更新目录不存在或无效。");
        return stage;
    }

    internal static void SignalReady(string root, string name)
    {
        var stage = ValidateStage(root, name);
        File.WriteAllText(Path.Combine(stage, "ready"), "ready");
    }

    private static void MoveWithRetry(Action action)
    {
        for (int i = 0; ; i++)
        {
            try { action(); return; }
            catch (IOException) when (i < 30) { Thread.Sleep(200); }
            catch (UnauthorizedAccessException) when (i < 30) { Thread.Sleep(200); }
        }
    }

    internal static void InstallFiles(string root, string stage, Action launchAndCheck)
    {
        var payload = Path.Combine(stage, "payload");
        var backup = Path.Combine(stage, "backup");
        Directory.CreateDirectory(backup);
        var exe = Path.Combine(root, ExeName);
        var resources = Path.Combine(root, "resources");
        var oldExe = Path.Combine(backup, ExeName);
        var oldResources = Path.Combine(backup, "resources");
        bool savedExe = false, savedResources = false, newExe = false, newResources = false;
        try
        {
            MoveWithRetry(() => File.Move(exe, oldExe)); savedExe = true;
            MoveWithRetry(() => Directory.Move(resources, oldResources)); savedResources = true;
            MoveWithRetry(() => File.Move(Path.Combine(payload, ExeName), exe)); newExe = true;
            MoveWithRetry(() => Directory.Move(Path.Combine(payload, "resources"), resources)); newResources = true;
            launchAndCheck();
        }
        catch (Exception installError)
        {
            var restoreErrors = new List<Exception>();
            void Restore(Action action) { try { MoveWithRetry(action); } catch (Exception e) { restoreErrors.Add(e); } }
            if (newResources) Restore(() => Directory.Move(resources, Path.Combine(payload, "resources")));
            if (newExe) Restore(() => File.Move(exe, Path.Combine(payload, ExeName)));
            if (savedResources) Restore(() => Directory.Move(oldResources, resources));
            if (savedExe) Restore(() => File.Move(oldExe, exe));
            if (restoreErrors.Count > 0)
                throw new InvalidOperationException("更新失败，自动恢复未完成。原程序备份位于：" + backup,
                    new AggregateException(new[] { installError }.Concat(restoreErrors)));
            throw new InvalidOperationException("更新失败，原程序已恢复：" + installError.Message, installError);
        }
        TryDelete(backup);
        File.WriteAllText(Path.Combine(stage, "complete"), "complete");
    }

    internal static void ApplyFromHelper(int parentId)
    {
        var stage = Path.TrimEndingDirectorySeparator(Path.GetFullPath(AppContext.BaseDirectory));
        var root = Path.GetDirectoryName(stage) ?? throw new InvalidDataException("更新目录无效。");
        ValidateStage(root, Path.GetFileName(stage));
        if (!SamePath(Environment.ProcessPath ?? "", Path.Combine(stage, "helper.exe")))
            throw new InvalidOperationException("更新进程路径无效。");
        var exe = Path.Combine(root, ExeName);
        Process? parent = null;
        try { parent = Process.GetProcessById(parentId); } catch (ArgumentException) { }
        using (parent)
        {
            if (parent is not null && !parent.HasExited)
            {
                if (!SamePath(parent.MainModule?.FileName ?? "", exe))
                    throw new InvalidOperationException("主程序进程与更新目录不匹配。");
                if (!parent.WaitForExit(60000)) throw new InvalidOperationException("等待主程序退出超时。");
            }
        }
        try
        {
            InstallFiles(root, stage, () =>
            {
                var info = new ProcessStartInfo(exe) { UseShellExecute = false, WorkingDirectory = root };
                info.ArgumentList.Add("--update-ready");
                info.ArgumentList.Add(Path.GetFileName(stage));
                using var app = Process.Start(info) ?? throw new InvalidOperationException("新版程序无法启动。");
                var ready = Path.Combine(stage, "ready");
                var watch = Stopwatch.StartNew();
                try
                {
                    while (watch.Elapsed < TimeSpan.FromSeconds(60))
                    {
                        if (app.HasExited) throw new InvalidOperationException("新版程序启动后退出。");
                        if (File.Exists(ready)) return;
                        Thread.Sleep(250);
                    }
                    throw new InvalidOperationException("新版程序未完成启动。");
                }
                catch
                {
                    if (!app.HasExited) { app.Kill(entireProcessTree: true); app.WaitForExit(10000); }
                    throw;
                }
            });
        }
        catch
        {
            // Relaunch the restored version only when the backup was fully restored.
            if (File.Exists(exe) && Directory.Exists(Path.Combine(root, "resources"))
                && !File.Exists(Path.Combine(stage, "backup", ExeName))
                && !Directory.Exists(Path.Combine(stage, "backup", "resources")))
                Process.Start(new ProcessStartInfo(exe) { UseShellExecute = false, WorkingDirectory = root });
            throw;
        }
    }

    internal static void CleanupCompleted(string root)
    {
        foreach (var dir in Directory.EnumerateDirectories(root, StagePrefix + "*"))
        {
            if (!StagePattern.IsMatch(Path.GetFileName(dir)) || (File.GetAttributes(dir) & FileAttributes.ReparsePoint) != 0) continue;
            if (File.Exists(Path.Combine(dir, "complete"))) TryDelete(dir);
        }
    }

    private static void TryDelete(string path)
    {
        try { if (Directory.Exists(path)) Directory.Delete(path, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
    }
}
