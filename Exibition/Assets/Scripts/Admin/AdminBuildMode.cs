namespace Gallery.Admin
{
    public static class AdminBuildMode
    {
        /// <summary>Admin step 2: Sims camera + placement bridge.</summary>
        public static bool Active { get; set; }

        /// <summary>Admin draft preview / build: skip skybox, texture streaming, soft shadows.</summary>
        public static bool LightLoad { get; set; }
    }
}