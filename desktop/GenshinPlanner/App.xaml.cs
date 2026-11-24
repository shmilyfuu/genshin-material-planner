using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;

namespace GenshinPlanner;

public partial class App : Application
{
    internal static string? UpdateReadyStage { get; private set; }
    private InstanceCoordinator? _instance;
    private WindowState _lastWindowState = WindowState.Normal;
    private DispatcherTimer? _activationTimer;
    private bool? _originalTopmost;

    protected override void OnStartup(StartupEventArgs e)
    {
        ShutdownMode = ShutdownMode.OnExplicitShutdown;
        base.OnStartup(e);
        if (e.Args.Length == 2 && e.Args[0] == "--apply-update")
        {
            RunUpdateHelper(e.Args[1]);
            return;
        }

        var root = AppContext.BaseDirectory;
        if (e.Args.Length == 2 && e.Args[0] == "--update-ready")
        {
            try { UpdateHost.ValidateStage(root, e.Args[1]); UpdateReadyStage = e.Args[1]; }
            catch { }
        }
        try
        {
            _instance = new InstanceCoordinator(root);
            using var gate = InstanceCoordinator.OpenUpdateGate(root);
            bool ownsGate = false;
            try
            {
                // The replacement process must start while its helper owns the update gate.
                if (UpdateReadyStage is null)
                {
                    ownsGate = InstanceCoordinator.Wait(gate, 120000);
                    if (!ownsGate) throw new InvalidOperationException("程序正在更新，请稍后再启动。");
                }
                if (!_instance.TryAcquire())
                {
                    _instance.RequestActivation();
                    Shutdown(0);
                    return;
                }
            }
            finally { if (ownsGate) gate.ReleaseMutex(); }
            try { UpdateHost.CleanupCompleted(root); } catch { }
            MainWindow = new MainWindow();
            _lastWindowState = MainWindow.WindowState == WindowState.Maximized ? WindowState.Maximized : WindowState.Normal;
            MainWindow.StateChanged += (_, _) => { if (MainWindow.WindowState != WindowState.Minimized) _lastWindowState = MainWindow.WindowState; };
            _instance.Listen(() => { if (!Dispatcher.HasShutdownStarted) Dispatcher.BeginInvoke(new Action(ActivateExistingWindow)); });
            ShutdownMode = ShutdownMode.OnMainWindowClose;
            MainWindow.Show();
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "程序启动失败", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(1);
        }
    }

    private void ActivateExistingWindow()
    {
        var window = MainWindow;
        if (window is null) return;
        if (!window.IsVisible) window.Show();
        if (window.WindowState == WindowState.Minimized) window.WindowState = _lastWindowState;
        _originalTopmost ??= window.Topmost;
        window.Topmost = true;
        var hwnd = new WindowInteropHelper(window).Handle;
        window.Activate();
        if (hwnd != IntPtr.Zero && !SetForegroundWindow(hwnd) && GetForegroundWindow() != hwnd)
        {
            var flash = new FlashInfo { cbSize = (uint)Marshal.SizeOf<FlashInfo>(), hwnd = hwnd, dwFlags = 3, uCount = 3 };
            FlashWindowEx(ref flash);
        }
        _activationTimer?.Stop();
        _activationTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
        _activationTimer.Tick += (_, _) =>
        {
            _activationTimer.Stop();
            window.Topmost = _originalTopmost ?? false;
            _originalTopmost = null;
        };
        _activationTimer.Start();
    }

    private async void RunUpdateHelper(string argument)
    {
        if (!int.TryParse(argument, out var parentId) || parentId <= 0)
        {
            MessageBox.Show("更新进程参数无效。", "程序更新失败", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(1);
            return;
        }
        var label = new TextBlock { Text = "正在准备安装…", Foreground = Brushes.White, FontSize = 13, TextWrapping = TextWrapping.Wrap };
        var bar = new ProgressBar { IsIndeterminate = true, Height = 8, Margin = new Thickness(0, 16, 0, 0), Foreground = new SolidColorBrush(Color.FromRgb(224, 209, 180)) };
        var panel = new StackPanel { Margin = new Thickness(24) };
        panel.Children.Add(new TextBlock { Text = "正在更新原神养成规划", FontSize = 17, FontWeight = FontWeights.SemiBold, Foreground = Brushes.White, Margin = new Thickness(0, 0, 0, 12) });
        panel.Children.Add(label); panel.Children.Add(bar);
        var window = new Window
        {
            Title = "程序更新", Width = 400, Height = 160, ResizeMode = ResizeMode.NoResize,
            WindowStartupLocation = WindowStartupLocation.CenterScreen,
            Background = new SolidColorBrush(Color.FromRgb(38, 49, 62)),
            Content = panel, Topmost = true, ShowInTaskbar = true
        };
        bool finished = false;
        window.Closing += (_, e) => { if (!finished) e.Cancel = true; };
        window.Show();
        try
        {
            await Task.Run(() => UpdateHost.ApplyFromHelper(parentId, message =>
                Dispatcher.BeginInvoke(new Action(() => label.Text = message))));
            finished = true; window.Close(); Shutdown(0);
        }
        catch (Exception error)
        {
            finished = true; window.Close();
            MessageBox.Show(error.Message, "程序更新失败", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(1);
        }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _activationTimer?.Stop();
        _instance?.Dispose();
        base.OnExit(e);
    }

    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();
    [StructLayout(LayoutKind.Sequential)]
    private struct FlashInfo { public uint cbSize; public IntPtr hwnd; public uint dwFlags, uCount, dwTimeout; }
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool FlashWindowEx(ref FlashInfo info);
}
