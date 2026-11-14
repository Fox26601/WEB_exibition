using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Gallery.EditorTools
{
    /// <summary>
    /// Ensures Gallery.unity exists, is in Build Settings, and contains camera + light roots.
    /// Menu: Gallery → Ensure Gallery Scene. Also runs after scripts reload once if missing.
    /// </summary>
    public static class GallerySceneSetup
    {
        const string ScenePath = "Assets/Scenes/Gallery.unity";
        const string SceneGuid = "15996fee47474aa69db0800d28e4ac7f";

        [MenuItem("Gallery/Ensure Gallery Scene")]
        public static void EnsureGalleryScene()
        {
            EnsureSceneAsset();
            EnsureBuildSettings();
            EnsureSceneContents();
            AssetDatabase.SaveAssets();
            Debug.Log("Gallery scene ready: " + ScenePath);
        }

        [InitializeOnLoadMethod]
        static void AutoEnsureOnce()
        {
            EditorApplication.delayCall += () =>
            {
                if (!File.Exists(Path.Combine(Application.dataPath, "Scenes/Gallery.unity")))
                    EnsureGalleryScene();
                else
                    EnsureBuildSettings();
            };
        }

        static void EnsureSceneAsset()
        {
            var abs = Path.Combine(Application.dataPath, "Scenes/Gallery.unity");
            Directory.CreateDirectory(Path.GetDirectoryName(abs));
            if (File.Exists(abs))
                return;

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            CreateCamera();
            CreateLight();
            EditorSceneManager.SaveScene(scene, ScenePath);
        }

        static void EnsureSceneContents()
        {
            var scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            var roots = scene.GetRootGameObjects();
            bool hasCam = false;
            bool hasLight = false;
            foreach (var go in roots)
            {
                if (go.GetComponent<Camera>() != null) hasCam = true;
                if (go.GetComponent<Light>() != null) hasLight = true;
            }

            if (!hasCam) CreateCamera();
            if (!hasLight) CreateLight();
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
        }

        static void EnsureBuildSettings()
        {
            var scenes = EditorBuildSettings.scenes;
            for (var i = 0; i < scenes.Length; i++)
            {
                if (scenes[i].path == ScenePath)
                {
                    if (!scenes[i].enabled)
                    {
                        scenes[i].enabled = true;
                        EditorBuildSettings.scenes = scenes;
                    }
                    return;
                }
            }

            var list = new EditorBuildSettingsScene[scenes.Length + 1];
            list[0] = new EditorBuildSettingsScene(ScenePath, true);
            for (var i = 0; i < scenes.Length; i++)
                list[i + 1] = scenes[i];
            EditorBuildSettings.scenes = list;
        }

        static void CreateCamera()
        {
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.12f, 0.12f, 0.14f);
            cam.fieldOfView = 70f;
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 100f;
            camGo.AddComponent<AudioListener>();
            camGo.transform.position = new Vector3(0f, 1.6f, 1.2f);
        }

        static void CreateLight()
        {
            var lightGo = new GameObject("Directional Light");
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.05f;
            light.color = new Color(1f, 0.98f, 0.94f);
            light.shadows = LightShadows.Hard;
            lightGo.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
            lightGo.transform.position = new Vector3(0f, 3f, 0f);
        }

        // Keep meta GUID stable if regenerated from empty project.
        [MenuItem("Gallery/Fix Gallery Scene Meta GUID")]
        static void FixMetaGuid()
        {
            var metaPath = ScenePath + ".meta";
            if (!File.Exists(metaPath))
            {
                File.WriteAllText(metaPath,
                    "fileFormatVersion: 2\nguid: " + SceneGuid + "\nDefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n");
                AssetDatabase.Refresh();
            }
        }
    }
}
