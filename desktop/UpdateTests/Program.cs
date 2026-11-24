using GenshinPlanner;
using System.IO.Compression;

var temp = Path.Combine(Path.GetTempPath(), "planner-update-test-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(temp);
try
{
    void Require(bool value, string message) { if (!value) throw new Exception(message); }
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
    Console.WriteLine("Update tests passed.");
}
finally { Directory.Delete(temp, true); }
