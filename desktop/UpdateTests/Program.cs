using GenshinPlanner;
using System.IO.Compression;

var temp = Path.Combine(Path.GetTempPath(), "planner-update-test-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(temp);
try
{
    void Require(bool value, string message) { if (!value) throw new Exception(message); }
    Require(UpdateHost.NormalizeVersion(new Version(0, 6, 0, 0)).ToString() == "0.6.0", "Formal version display");
    Require(UpdateHost.NormalizeVersion(new Version(0, 6, 0, 1)).ToString() == "0.6.0.1", "Test version display");
    Require(UpdateHost.NormalizeVersion(new Version(0, 6, 0, 2)) > new Version(0, 6, 0), "Test version ordering");
    Require(new Version(0, 6, 1) > UpdateHost.NormalizeVersion(new Version(0, 6, 0, 99)), "Next formal version ordering");
    void Write(string root, string path, string text)
    {
        string file = Path.Combine(root, path);
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        File.WriteAllText(file, text);
    }
    string Read(string root, string file) => File.ReadAllText(Path.Combine(root, file));
    string MakeRoot(string name)
    {
        var root = Path.Combine(temp, name);
        Write(root, "GenshinPlanner.exe", "old");
        Write(root, "resources/wwwroot/index.html", "old-html");
        Write(root, "data/planner.json", "saved-plan");
        Write(root, "data/Miyoushe/accounts.dat", "saved-account");
        return root;
    }
    string MakeStage(string root)
    {
        var stage = Path.Combine(root, ".planner-update-" + Guid.NewGuid().ToString("N"));
        Write(stage, "payload/GenshinPlanner.exe", "new");
        Write(stage, "payload/resources/wwwroot/index.html", "new-html");
        return stage;
    }
    void CheckData(string root)
    {
        Require(Read(root, "data/planner.json") == "saved-plan", "Planner data changed");
        Require(Read(root, "data/Miyoushe/accounts.dat") == "saved-account", "Account data changed");
    }
    {
        var root = MakeRoot("success");
        var stage = MakeStage(root);
        UpdateHost.InstallFiles(root, stage, () =>
        {
            Require(Read(root, "GenshinPlanner.exe") == "new", "Executable not replaced");
            Require(Read(root, "resources/wwwroot/index.html") == "new-html", "Resources not replaced");
            CheckData(root);
        });
        Require(File.Exists(Path.Combine(stage, "complete")), "Completion marker missing");
        CheckData(root);
    }
    {
        var root = MakeRoot("rollback");
        var stage = MakeStage(root);
        bool failed = false;
        try { UpdateHost.InstallFiles(root, stage, () => throw new InvalidOperationException("startup failed")); }
        catch (InvalidOperationException e) { failed = e.Message.Contains("原程序已恢复"); }
        Require(failed, "Rollback not reported");
        Require(Read(root, "GenshinPlanner.exe") == "old", "Original executable not restored");
        Require(Read(root, "resources/wwwroot/index.html") == "old-html", "Original resources not restored");
        CheckData(root);
    }
    {
        var root = MakeRoot("missing-payload");
        var stage = MakeStage(root);
        Directory.Delete(Path.Combine(stage, "payload", "resources"), true);
        bool failed = false;
        try { UpdateHost.InstallFiles(root, stage, () => { }); }
        catch (InvalidOperationException) { failed = true; }
        Require(failed, "Missing payload not rejected");
        Require(Read(root, "GenshinPlanner.exe") == "old", "Executable not restored after move failure");
        Require(Read(root, "resources/wwwroot/index.html") == "old-html", "Resources not restored after move failure");
        CheckData(root);
    }
    void MakeZip(string path, string? extra)
    {
        using var zip = ZipFile.Open(path, ZipArchiveMode.Create);
        foreach (var name in new[] {"GenshinPlanner.exe", "resources/wwwroot/index.html", "resources/wwwroot/desktop-app.mjs"})
        {
            using var writer = new StreamWriter(zip.CreateEntry(name).Open());
            writer.Write("test");
        }
        zip.CreateEntry("data/");
        if (extra != null) { using var writer = new StreamWriter(zip.CreateEntry(extra).Open()); writer.Write("invalid"); }
    }
    var good = Path.Combine(temp, "good.zip");
    MakeZip(good, null);
    UpdateHost.ExtractPackage(good, Path.Combine(temp, "good"));
    Require(!Directory.Exists(Path.Combine(temp, "good", "data")), "Package data must not be extracted");
    foreach (var extra in new[] {"data/planner.json", "resources/wwwroot/../../data/planner.json", "resources/wwwroot/index.html:bad", "resources/wwwroot/INDEX.HTML", "other.exe"})
    {
        var bad = Path.Combine(temp, Guid.NewGuid().ToString("N") + ".zip");
        MakeZip(bad, extra);
        bool rejected = false;
        try { UpdateHost.ExtractPackage(bad, Path.Combine(temp, Guid.NewGuid().ToString("N"))); }
        catch (InvalidDataException) { rejected = true; }
        Require(rejected, "Invalid archive was accepted: " + extra);
    }
    {
        var root = MakeRoot("progress");
        var observations = new List<UpdateHost.Progress>();
        using var data = new MemoryStream(System.Text.Encoding.UTF8.GetBytes("progress test"));
        var hash = UpdateHost.HashWithProgressAsync(data, CancellationToken.None, observations.Add).GetAwaiter().GetResult();
        Require(hash.SequenceEqual(System.Security.Cryptography.SHA256.HashData(data.ToArray())), "Hash changed");
        Require(observations.First().phase == "verify" && observations.First().completed == 0, "Verify initial progress missing");
        Require(observations.Last().completed == data.Length && observations.Last().total == data.Length, "Verify progress incomplete");
        observations.Clear();
        UpdateHost.ExtractPackage(good, Path.Combine(root, "extracted"), observations.Add);
        Require(observations.First().phase == "extract" && observations.First().completed == 0, "Extract initial progress missing");
        Require(observations.Last().completed == observations.Last().total && observations.Last().total > 0, "Extract progress incomplete");
        Require(observations.Zip(observations.Skip(1)).All(pair => pair.First.completed <= pair.Second.completed), "Extract progress regressed");
    }
    if (OperatingSystem.IsWindows())
    {
        var root = MakeRoot("instance");
        var primary = new InstanceCoordinator(root);
        Require(primary.TryAcquire(), "Primary instance not acquired");
        using var activated = new ManualResetEventSlim();
        primary.Listen(activated.Set);
        Task.Run(() =>
        {
            using var duplicate = new InstanceCoordinator(root);
            Require(!duplicate.TryAcquire(), "Duplicate acquired same instance lock");
            duplicate.RequestActivation();
            using var separate = new InstanceCoordinator(root + "-other");
            Require(separate.TryAcquire(), "Independent portable directory was blocked");
        }).GetAwaiter().GetResult();
        Require(activated.Wait(TimeSpan.FromSeconds(5)), "Activation signal missing");
        using var gate = InstanceCoordinator.OpenUpdateGate(root);
        Require(InstanceCoordinator.Wait(gate, 0), "Update gate not acquired");
        try
        {
            Task.Run(() =>
            {
                using var otherGate = InstanceCoordinator.OpenUpdateGate(root);
                Require(!InstanceCoordinator.Wait(otherGate, 0), "Concurrent normal startup bypassed update gate");
            }).GetAwaiter().GetResult();
        }
        finally { gate.ReleaseMutex(); }
        primary.Dispose();
        Task.Run(() =>
        {
            using var replacement = new InstanceCoordinator(root);
            Require(replacement.TryAcquire(), "Replacement instance not acquired after release");
        }).GetAwaiter().GetResult();
    }
    await CacheTests.RunAsync(temp);
    Console.WriteLine("Update and instance tests passed.");
}
finally { Directory.Delete(temp, true); }
