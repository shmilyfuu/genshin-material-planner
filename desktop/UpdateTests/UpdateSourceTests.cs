using GenshinPlanner;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Text;

internal static class UpdateSourceTests
{
    private const string Repo = "shmilyfuu/genshin-material-planner";
    private const string Tag = "desktop-v0.6.3";
    private const string FileName = "GenshinPlanner-WebView2-v0.6.3-win-x64.zip";
    private static void Require(bool value, string message) { if (!value) throw new Exception(message); }
    private static object[] Assets(bool gitee) => new[] { FileName, FileName + ".sha256" }.Select(name => (object)new
    {
        name, size = 123L,
        browser_download_url = gitee
            ? $"https://gitee.com/{Repo}/attach_files/123/download"
            : $"https://github.com/{Repo}/releases/download/{Tag}/{name}"
    }).ToArray();

    private static object Release(bool gitee) => new
    {
        id = 123L, tag_name = Tag, draft = false, prerelease = false,
        body = "Release notes", assets = gitee ? Array.Empty<object>() : Assets(false)
    };

    private static HttpResponseMessage Json(object body) => new(HttpStatusCode.OK)
    { Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json") };

    private sealed class Handler(Func<Uri, HttpResponseMessage> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
            => Task.FromResult(send(request.RequestUri!));
    }

    internal static async Task RunAsync()
    {
        var current = new Version(0, 6, 2);
        var calls = new List<string>();
        using (var http = new HttpClient(new Handler(uri =>
        {
            calls.Add(uri.Host);
            return Json(new[] { Release(false) });
        })))
        {
            var release = await UpdateHost.CheckSourcesAsync(http, current);
            Require(release is { Gitee: false } && release.Version == new Version(0, 6, 3), "GitHub must be preferred");
            Require(calls.SequenceEqual(new[] { "api.github.com" }), "Gitee queried after GitHub success");
            calls.Clear();
            release = await UpdateHost.CheckSourcesAsync(http, new Version(0, 6, 3));
            Require(release is null && calls.SequenceEqual(new[] { "api.github.com" }), "Up-to-date GitHub must stop check");
        }
        calls.Clear();
        using (var http = new HttpClient(new Handler(uri =>
        {
            calls.Add(uri.Host);
            if (uri.Host == "api.github.com") throw new TaskCanceledException("simulated timeout");
            return uri.AbsolutePath.EndsWith("/attach_files") ? Json(Assets(true)) : Json(new[] { Release(true) });
        })))
        {
            var release = await UpdateHost.CheckSourcesAsync(http, current);
            Require(release is { Gitee: true } && release.Version == new Version(0, 6, 3), "Timeout fallback failed");
            Require(calls.SequenceEqual(new[] { "api.github.com", "gitee.com", "gitee.com" }), "Unexpected source order");
        }
        using (var http = new HttpClient(new Handler(uri =>
            uri.AbsolutePath.EndsWith("/attach_files") ? Json(Assets(true)) : Json(Release(true)))))
        {
            var release = await UpdateHost.FindReleaseAsync(http, true, current, new Version(0, 6, 3));
            Require(release is { Gitee: true }, "Exact fallback target failed");
            bool rejected = false;
            try { await UpdateHost.FindReleaseAsync(http, true, current, new Version(0, 6, 4)); }
            catch (InvalidDataException) { rejected = true; }
            Require(rejected, "Wrong fallback version was accepted");
        }
        using (var http = new HttpClient(new Handler(uri => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable))))
        {
            bool failed = false;
            try { await UpdateHost.CheckSourcesAsync(http, current); }
            catch (InvalidOperationException e) { failed = e.Message.Contains("GitHub") && e.Message.Contains("Gitee"); }
            Require(failed, "Both source failures must be reported");
        }
    }
}
