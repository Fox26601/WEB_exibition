using UnityEditor;
using UnityEngine;

namespace Gallery.EditorTools
{
    /// <summary>
    /// Batchmode compile smoke:
    /// Unity -batchmode -nographics -quit -projectPath … -executeMethod Gallery.EditorTools.BatchCompileCheck.Run
    /// </summary>
    public static class BatchCompileCheck
    {
        public static void Run()
        {
            if (EditorUtility.scriptCompilationFailed)
            {
                Debug.LogError("BatchCompileCheck: script compilation failed.");
                EditorApplication.Exit(1);
                return;
            }

            Debug.Log("BatchCompileCheck: OK");
            EditorApplication.Exit(0);
        }
    }
}
