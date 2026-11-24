using System.IO;
using System.Windows;

namespace GenshinPlanner;

public partial class App : Application
{
    internal static string? UpdateReadyStage { get; private set; }

    protected override void OnStartup(StartupEventArgs e)
    {
        if (e.Args.Length == 2 && e.Args[0] == "--apply-update")
        {
            ShutdownMode = ShutdownMode.OnExplicitShutdown;
            base.OnStartup(e);
            try
            {
                if (!int.TryParse(e.Args[1], out var parentId) || parentId <= 0)
                    throw new InvalidDataException("更新进程参数无效。");
                UpdateHost.ApplyFromHelper(parentId);
                Shutdown(0);
            }
            catch (Exception error)
            {
                MessageBox.Show(error.Message, "程序更新失败", MessageBoxButton.OK, MessageBoxImage.Error);
                Shutdown(1);
            }
            return;
        }
        if (e.Args.Length == 2 && e.Args[0] == "--update-ready")
        {
            try { UpdateHost.ValidateStage(AppContext.BaseDirectory, e.Args[1]); UpdateReadyStage = e.Args[1]; }
            catch { }
        }
        try { UpdateHost.CleanupCompleted(AppContext.BaseDirectory); } catch { }
        base.OnStartup(e);
        MainWindow = new MainWindow();
        MainWindow.Show();
    }
}
