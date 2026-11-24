using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

namespace GenshinPlanner;

// Each portable data directory has its own instance and update gate.
internal sealed class InstanceCoordinator : IDisposable
{
    private readonly Mutex _instance;
    private readonly EventWaitHandle _activate;
    private RegisteredWaitHandle? _listener;
    private bool _owns;

    internal static string Identity(string root)
    {
        string path = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.Combine(root, "data")));
        return @"Local\GenshinPlanner-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(path.ToUpperInvariant())));
    }

    internal InstanceCoordinator(string root)
    {
        var identity = Identity(root);
        _instance = new Mutex(false, identity + "-instance");
        _activate = new EventWaitHandle(false, EventResetMode.AutoReset, identity + "-activate");
    }

    internal static Mutex OpenUpdateGate(string root) => new(false, Identity(root) + "-update");
    internal static bool Wait(Mutex mutex, int milliseconds)
    {
        try { return mutex.WaitOne(milliseconds); }
        catch (AbandonedMutexException) { return true; }
    }

    internal bool TryAcquire()
    {
        if (_owns) return true;
        _owns = Wait(_instance, 0);
        return _owns;
    }

    internal void RequestActivation() => _activate.Set();

    internal void Listen(Action activate)
    {
        if (!_owns) throw new InvalidOperationException("当前进程未取得实例锁。");
        _listener = ThreadPool.RegisterWaitForSingleObject(_activate, (_, timedOut) =>
        {
            if (!timedOut) activate();
        }, null, Timeout.Infinite, false);
    }

    public void Dispose()
    {
        _listener?.Unregister(null);
        if (_owns) { _instance.ReleaseMutex(); _owns = false; }
        _activate.Dispose();
        _instance.Dispose();
    }
}
