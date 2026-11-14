using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace Gallery.EditorTools
{
    /// <summary>
    /// Batchmode WebGL export:
    /// Unity -batchmode -nographics -quit -projectPath Exibition
    ///   -executeMethod Gallery.EditorTools.WebGLBuilder.Build
    /// Optional: -buildPath absoluteOrRelativeOutputDir
    /// </summary>
    public static class WebGLBuilder
    {
        const string DefaultRelativeOut = "Builds/WebGL";

        public static void Build()
        {
            if (EditorUtility.scriptCompilationFailed)
            {
                Debug.LogError("WebGLBuilder: script compilation failed.");
                EditorApplication.Exit(1);
                return;
            }

            GallerySceneSetup.EnsureGalleryScene();

            var outPath = ResolveOutputPath();
            Directory.CreateDirectory(outPath);

            var scenes = new[] { "Assets/Scenes/Gallery.unity" };
            Debug.Log("WebGLBuilder: switching active build target to WebGL…");
            if (!EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.WebGL, BuildTarget.WebGL))
            {
                Debug.LogError("WebGLBuilder: failed to switch build target to WebGL.");
                EditorApplication.Exit(1);
                return;
            }

            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.None;
            PlayerSettings.SetManagedStrippingLevel(BuildTargetGroup.WebGL, ManagedStrippingLevel.High);
            PlayerSettings.stripEngineCode = true;

            var options = new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = outPath,
                target = BuildTarget.WebGL,
                options = BuildOptions.None,
            };

            Debug.Log("WebGLBuilder: building to " + outPath);
            var report = BuildPipeline.BuildPlayer(options);
            var summary = report.summary;
            if (summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
            {
                Debug.LogError("WebGLBuilder: build failed — " + summary.result + " errors=" + summary.totalErrors);
                EditorApplication.Exit(1);
                return;
            }

            Debug.Log("WebGLBuilder: OK → " + outPath + " size=" + summary.totalSize);
            EditorApplication.Exit(0);
        }

        static string ResolveOutputPath()
        {
            var args = Environment.GetCommandLineArgs();
            for (var i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "-buildPath" && !string.IsNullOrWhiteSpace(args[i + 1]))
                {
                    var p = args[i + 1];
                    return Path.IsPathRooted(p) ? p : Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), p));
                }
            }

            return Path.GetFullPath(Path.Combine(Directory.GetParent(Application.dataPath).FullName, DefaultRelativeOut));
        }
    }
}
