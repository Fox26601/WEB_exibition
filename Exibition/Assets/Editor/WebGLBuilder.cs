using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

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

            // Uncompressed: Safari/WebKit ignores Content-Encoding on Unity gzip assets.
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.FullWithoutStacktrace;
            PlayerSettings.SetManagedStrippingLevel(
                UnityEditor.Build.NamedBuildTarget.WebGL,
                ManagedStrippingLevel.Low);
            PlayerSettings.stripEngineCode = false;

            // URP blit shaders throw ArgumentNullException(shader) on many WebGL GPUs.
            // Build with Built-in RP, then restore Editor URP settings.
            var previousDefault = GraphicsSettings.defaultRenderPipeline;
            var previousQualityPipes = CaptureQualityPipelines();
            ClearRenderPipelines();

            var exitCode = 1;
            try
            {
                var options = new BuildPlayerOptions
                {
                    scenes = scenes,
                    locationPathName = outPath,
                    target = BuildTarget.WebGL,
                    options = BuildOptions.None,
                };

                Debug.Log("WebGLBuilder: building to " + outPath + " (Built-in RP for WebGL)");
                var report = BuildPipeline.BuildPlayer(options);
                var summary = report.summary;
                if (summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                {
                    Debug.LogError("WebGLBuilder: build failed — " + summary.result + " errors=" + summary.totalErrors);
                    exitCode = 1;
                }
                else
                {
                    Debug.Log("WebGLBuilder: OK → " + outPath + " size=" + summary.totalSize);
                    exitCode = 0;
                }
            }
            finally
            {
                GraphicsSettings.defaultRenderPipeline = previousDefault;
                RestoreQualityPipelines(previousQualityPipes);
                AssetDatabase.SaveAssets();
            }

            EditorApplication.Exit(exitCode);
        }

        static List<RenderPipelineAsset> CaptureQualityPipelines()
        {
            var list = new List<RenderPipelineAsset>();
            var so = new SerializedObject(
                Unsupported.GetSerializedAssetInterfaceSingleton("QualitySettings"));
            var settings = so.FindProperty("m_QualitySettings");
            for (var i = 0; i < settings.arraySize; i++)
            {
                var pipe = settings.GetArrayElementAtIndex(i)
                    .FindPropertyRelative("customRenderPipeline");
                list.Add(pipe.objectReferenceValue as RenderPipelineAsset);
            }

            return list;
        }

        static void ClearRenderPipelines()
        {
            GraphicsSettings.defaultRenderPipeline = null;
            var so = new SerializedObject(
                Unsupported.GetSerializedAssetInterfaceSingleton("QualitySettings"));
            var settings = so.FindProperty("m_QualitySettings");
            for (var i = 0; i < settings.arraySize; i++)
            {
                settings.GetArrayElementAtIndex(i)
                    .FindPropertyRelative("customRenderPipeline").objectReferenceValue = null;
            }

            so.ApplyModifiedPropertiesWithoutUndo();
        }

        static void RestoreQualityPipelines(List<RenderPipelineAsset> pipes)
        {
            var so = new SerializedObject(
                Unsupported.GetSerializedAssetInterfaceSingleton("QualitySettings"));
            var settings = so.FindProperty("m_QualitySettings");
            var n = Mathf.Min(settings.arraySize, pipes.Count);
            for (var i = 0; i < n; i++)
            {
                settings.GetArrayElementAtIndex(i)
                    .FindPropertyRelative("customRenderPipeline").objectReferenceValue = pipes[i];
            }

            so.ApplyModifiedPropertiesWithoutUndo();
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
