using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace GenshinPlanner;

internal sealed class MiyousheHost(string dataDir)
{
    private static readonly HttpClient Http = new(new HttpClientHandler
    {
        AllowAutoRedirect = false, UseCookies = false
    }) { Timeout = TimeSpan.FromSeconds(20) };

    private static readonly HashSet<string> Endpoints = new(StringComparer.Ordinal)
    {
        "POST https://passport-api.mihoyo.com/account/ma-cn-passport/app/createQRLogin",
        "POST https://passport-api.mihoyo.com/account/ma-cn-passport/app/queryQRLoginStatus",
        "POST https://passport-api.mihoyo.com/account/ma-cn-session/app/exchange",
        "POST https://public-data-api.mihoyo.com/device-fp/api/getFp",
        "GET https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie?game_biz=hk4e_cn",
        "POST https://api-takumi.mihoyo.com/event/e20200928calculate/v1/avatar/list",
        "POST https://api-takumi.mihoyo.com/event/e20200928calculate/v1/weapon/list",
        "POST https://api-takumi.mihoyo.com/event/e20200928calculate/v3/batch_compute"
    };

    private readonly SemaphoreSlim gate = new(1, 1);

    private string StoragePath(JsonObject? data)
    {
        var key = data?["key"]?.GetValue<string>() ?? "";
        var name = key switch
        {
            "mysAuthAccounts" => "accounts.dat",
            "mysAuthDevice" => "device.dat",
            _ => throw new InvalidOperationException("登录存储键无效。")
        };
        return Path.Combine(dataDir, "Miyoushe", name);
    }

    public async Task<JsonNode?> LoadAsync(JsonObject? data)
    {
        var path = StoragePath(data);
        await gate.WaitAsync();
        try
        {
            if (!File.Exists(path)) return null;
            var encrypted = await File.ReadAllBytesAsync(path);
            return JsonNode.Parse(ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser));
        }
        finally { gate.Release(); }
    }

    public async Task<bool> SaveAsync(JsonObject? data)
    {
        var path = StoragePath(data);
        var value = data?["value"]?.ToJsonString() ?? throw new InvalidOperationException("缺少登录记录。");
        if (value.Length > 1024 * 1024) throw new InvalidOperationException("登录记录过大。");
        await gate.WaitAsync();
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var bytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(value), null, DataProtectionScope.CurrentUser);
            await File.WriteAllBytesAsync(path + ".tmp", bytes);
            File.Move(path + ".tmp", path, true);
            return true;
        }
        finally { gate.Release(); }
    }

    public async Task<JsonObject> RequestAsync(JsonObject? data)
    {
        var url = data?["url"]?.GetValue<string>() ?? "";
        var method = data?["method"]?.GetValue<string>() ?? "";
        if (!Endpoints.Contains(method + " " + url)) throw new InvalidOperationException("米游社接口地址无效。");
        using var request = new HttpRequestMessage(new HttpMethod(method), url);
        if (method == "POST")
        {
            var body = data?["body"]?.GetValue<string>() ?? "{}";
            if (body.Length > 1024 * 1024) throw new InvalidOperationException("计算请求过大。");
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }
        if (data?["headers"] is JsonObject headers)
        {
            foreach (var entry in headers)
            {
                var name = entry.Key;
                var value = entry.Value?.GetValue<string>() ?? "";
                if (value.Contains('\r') || value.Contains('\n')) throw new InvalidOperationException("请求头无效。");
                if (name.Equals("Content-Type", StringComparison.OrdinalIgnoreCase))
                {
                    if (request.Content != null)
                    {
                        request.Content.Headers.Remove("Content-Type");
                        request.Content.Headers.TryAddWithoutValidation(name, value);
                    }
                    continue;
                }
                if (name.StartsWith("x-rpc-", StringComparison.OrdinalIgnoreCase)
                    || new[] {"Accept","User-Agent","DS","Cookie","Referer","Origin"}.Contains(name, StringComparer.OrdinalIgnoreCase))
                    request.Headers.TryAddWithoutValidation(name, value);
            }
        }
        using var response = await Http.SendAsync(request);
        var raw = await response.Content.ReadAsStringAsync();
        JsonNode? payload;
        try { payload = JsonNode.Parse(raw); }
        catch { throw new InvalidOperationException("米游社返回了非 JSON 响应：HTTP " + (int)response.StatusCode); }
        return new JsonObject { ["status"] = (int)response.StatusCode, ["ok"] = response.IsSuccessStatusCode, ["payload"] = payload };
    }
}
