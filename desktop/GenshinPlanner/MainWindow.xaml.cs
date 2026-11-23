using Microsoft.Web.WebView2.Core;
using System.ComponentModel;
using System.Globalization;
using Microsoft.Win32;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows;

namespace GenshinPlanner;

public partial class MainWindow : Window
{
    private static readonly HttpClient Http = new()
    {
        BaseAddress = new Uri("https://static.nanoka.cc/"),
        Timeout = TimeSpan.FromSeconds(20)
    };

    private readonly string _dataDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GenshinPlanner");
    private string StateFile => Path.Combine(_dataDir, "planner.json");
    private string LayoutFile => Path.Combine(_dataDir, "desktop-layout.json");
    private readonly object _layoutLock = new();
    private string CacheDir => Path.Combine(_dataDir, "NanokaCache");

    public MainWindow()
    {
        InitializeComponent();
        RestoreWindowLayout();
        Loaded += OnLoaded;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            Directory.CreateDirectory(_dataDir);
            var environment = await CoreWebView2Environment.CreateAsync(
                userDataFolder: Path.Combine(_dataDir, "WebView2"));
            await Browser.EnsureCoreWebView2Async(environment);
            var core = Browser.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsWebMessageEnabled = true;
            core.SetVirtualHostNameToFolderMapping(
                "planner.local",
                Path.Combine(AppContext.BaseDirectory, "wwwroot"),
                CoreWebView2HostResourceAccessKind.DenyCors);
            core.WebMessageReceived += OnWebMessageReceived;
            Browser.Source = new Uri("https://planner.local/index.html");
        }
        catch (Exception error)
        {
            MessageBox.Show(this, error.Message, "WebView2 启动失败",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        string requestId = "";
        try
        {
            if (args.Source != "https://planner.local/index.html")
                throw new InvalidOperationException("消息来源验证失败。");

            var message = JsonNode.Parse(args.WebMessageAsJson) as JsonObject
                ?? throw new InvalidOperationException("消息格式错误。");
            requestId = message["id"]?.GetValue<string>() ?? "";
            string type = message["type"]?.GetValue<string>() ?? "";
            var data = message["params"] as JsonObject;
            object? result = type switch
            {
                "ui.layout.load" => ReadLayout(),
                "ui.layout.save" => SaveColumns(data),
                "storage.load" => await LoadStateAsync(),
                "storage.save" => await SaveStateAsync(data),
                "data.fetch" => await FetchNanokaAsync(data),
                "storage.export" => ExportState(data),
                "storage.import" => await ImportStateAsync(),
                _ => throw new InvalidOperationException("未知操作。")
            };
            Reply(new { id = requestId, ok = true, data = result });
        }
        catch (Exception error)
        {
            Reply(new { id = requestId, ok = false, error = error.Message });
        }
    }

    private void Reply(object response)
    {
        Browser.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(response));
    }

    private JsonObject ReadLayout()
    {
        lock (_layoutLock)
        {
            try
            {
                if (File.Exists(LayoutFile))
                    return JsonNode.Parse(File.ReadAllText(LayoutFile)) as JsonObject ?? new JsonObject();
            }
            catch (Exception) { /* An invalid layout uses the default window geometry. */ }
            return new JsonObject();
        }
    }

    private void WriteLayout(JsonObject settings)
    {
        lock (_layoutLock)
        {
            Directory.CreateDirectory(_dataDir);
            string temporary = LayoutFile + ".tmp";
            File.WriteAllText(temporary, settings.ToJsonString());
            File.Move(temporary, LayoutFile, true);
        }
    }

    private bool SaveColumns(JsonObject? data)
    {
        if (data?["layout"]?["columns"] is not JsonArray values || values.Count != 4)
            throw new InvalidDataException("列宽配置格式错误。");
        var columns = new double[4];
        for (int index = 0; index < 4; index++)
        {
            if (!double.TryParse(values[index]?.ToString(), NumberStyles.Float,
                    CultureInfo.InvariantCulture, out var value) ||
                !double.IsFinite(value) || value < 100 || value > 4000)
                throw new InvalidDataException("列宽超出范围。");
            columns[index] = value;
        }
        var layout = ReadLayout();
        layout["columns"] = new JsonArray(columns.Select(v => JsonValue.Create(v)).ToArray());
        WriteLayout(layout);
        return true;
    }

    private void RestoreWindowLayout()
    {
        var settings = ReadLayout()["window"] as JsonObject;
        if (settings is null) return;
        try
        {
            double x = settings["left"]!.GetValue<double>();
            double y = settings["top"]!.GetValue<double>();
            double width = settings["width"]!.GetValue<double>();
            double height = settings["height"]!.GetValue<double>();
            if (!double.IsFinite(x) || !double.IsFinite(y) ||
                !double.IsFinite(width) || !double.IsFinite(height) ||
                width < MinWidth || height < MinHeight || width > 6000 || height > 4000) return;
            var virtualBounds = new Rect(SystemParameters.VirtualScreenLeft, SystemParameters.VirtualScreenTop,
                SystemParameters.VirtualScreenWidth, SystemParameters.VirtualScreenHeight);
            var savedBounds = new Rect(x, y, width, height);
            // Require a usable portion of the title bar to remain on a connected display.
            if (!virtualBounds.IntersectsWith(savedBounds) ||
                x > virtualBounds.Right - 120 || y > virtualBounds.Bottom - 60 ||
                x + width < virtualBounds.Left + 120 || y + height < virtualBounds.Top + 60) return;
            WindowStartupLocation = WindowStartupLocation.Manual;
            Left = x;
            Top = y;
            Width = width;
            Height = height;
            if (settings["maximized"]?.GetValue<bool>() == true) WindowState = WindowState.Maximized;
        }
        catch (Exception) { /* Use the initial 1600 x 900 window. */ }
    }

    protected override void OnClosing(CancelEventArgs e)
    {
        try
        {
            var bounds = WindowState == WindowState.Normal
                ? new Rect(Left, Top, Width, Height) : RestoreBounds;
            if (bounds.Width >= MinWidth && bounds.Height >= MinHeight)
            {
                var settings = ReadLayout();
                settings["window"] = new JsonObject
                {
                    ["left"] = bounds.Left, ["top"] = bounds.Top,
                    ["width"] = bounds.Width, ["height"] = bounds.Height,
                    ["maximized"] = WindowState == WindowState.Maximized
                };
                WriteLayout(settings);
            }
        }
        catch (Exception) { /* Layout persistence must not prevent the window closing. */ }
        base.OnClosing(e);
    }

    private async Task<JsonNode?> LoadStateAsync()
    {
        if (!File.Exists(StateFile)) return null;
        var text = await File.ReadAllTextAsync(StateFile);
        return JsonNode.Parse(text);
    }

    private async Task<bool> SaveStateAsync(JsonObject? data)
    {
        var json = data?["state"]?.ToJsonString() ?? throw new InvalidOperationException("缺少数据。");
        if (Encoding.UTF8.GetByteCount(json) > 8 * 1024 * 1024)
            throw new InvalidOperationException("规划数据超过存储限制。");
        Directory.CreateDirectory(_dataDir);
        var temp = StateFile + ".tmp";
        await File.WriteAllTextAsync(temp, json);
        File.Move(temp, StateFile, true);
        return true;
    }

    private async Task<JsonNode> FetchNanokaAsync(JsonObject? data)
    {
        var path = data?["path"]?.GetValue<string>() ?? "";
        if (path.Contains("..", StringComparison.Ordinal) ||
            !Regex.IsMatch(path, @"^/(?:manifest\.json|gi/[A-Za-z0-9_./-]+\.json)$"))
            throw new InvalidOperationException("数据资源路径无效。");

        Directory.CreateDirectory(CacheDir);
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(path))).ToLowerInvariant();
        var cacheFile = Path.Combine(CacheDir, hash + ".json");
        var force = data?["force"]?.GetValue<bool>() ?? false;
        var maxAge = data?["maxAge"]?.GetValue<double>() ?? 86400000;
        if (!force && File.Exists(cacheFile) &&
            (DateTime.UtcNow - File.GetLastWriteTimeUtc(cacheFile)).TotalMilliseconds < maxAge)
        {
            return new JsonObject { ["data"] = JsonNode.Parse(await File.ReadAllTextAsync(cacheFile)), ["source"] = "cache" };
        }
        try
        {
            using var response = await Http.GetAsync(path.TrimStart('/'));
            response.EnsureSuccessStatusCode();
            var content = await response.Content.ReadAsStringAsync();
            var parsed = JsonNode.Parse(content) ?? throw new InvalidDataException("空的数据响应。");
            await File.WriteAllTextAsync(cacheFile, content);
            return new JsonObject { ["data"] = parsed, ["source"] = "network" };
        }
        catch when (File.Exists(cacheFile))
        {
            return new JsonObject { ["data"] = JsonNode.Parse(await File.ReadAllTextAsync(cacheFile)), ["source"] = "stale-cache" };
        }
    }

    private bool ExportState(JsonObject? data)
    {
        var json = data?["state"]?.ToJsonString(new JsonSerializerOptions { WriteIndented = true })
            ?? throw new InvalidOperationException("缺少可导出的规划数据。");
        var dialog = new SaveFileDialog { FileName = "原神养成规划.json", Filter = "JSON 文件 (*.json)|*.json" };
        if (dialog.ShowDialog(this) != true) return false;
        File.WriteAllText(dialog.FileName, json);
        return true;
    }

    private async Task<JsonNode?> ImportStateAsync()
    {
        var dialog = new OpenFileDialog { Filter = "JSON 文件 (*.json)|*.json" };
        if (dialog.ShowDialog(this) != true) return null;
        var info = new FileInfo(dialog.FileName);
        if (info.Length > 8 * 1024 * 1024) throw new InvalidDataException("文件过大。");
        var json = await File.ReadAllTextAsync(dialog.FileName);
        var node = JsonNode.Parse(json);
        return node is JsonObject ? node : throw new InvalidDataException("配置数据格式错误。");
    }
}
