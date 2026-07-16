import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { PublisherGithub } from "@electron-forge/publisher-github";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

const [owner, name] = (process.env.GITHUB_REPOSITORY ?? "lichen0114/margin-reader").split("/");
const signingIdentity = process.env.APPLE_CODESIGN_IDENTITY;
const notarize = process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER ? {
  appleApiKey: process.env.APPLE_API_KEY,
  appleApiKeyId: process.env.APPLE_API_KEY_ID,
  appleApiIssuer: process.env.APPLE_API_ISSUER
} : undefined;

const config: ForgeConfig = {
  packagerConfig: {
    name: "Margin Reader",
    executableName: "Margin Reader",
    appBundleId: "com.lichen0114.marginreader",
    appCategoryType: "public.app-category.books",
    appCopyright: `Copyright © ${new Date().getFullYear()} Margin Reader`,
    asar: true,
    extraResource: ["node_modules/better-sqlite3/build/Release/better_sqlite3.node"],
    ignore: (file) => {
      if (!file) return false;
      return !["/.vite", "/node_modules/better-sqlite3", "/node_modules/bindings", "/node_modules/file-uri-to-path"].some((included) => file.startsWith(included));
    },
    extendInfo: { LSMinimumSystemVersion: "12.0" },
    osxSign: signingIdentity
      ? { identity: signingIdentity, optionsForFile: () => ({ entitlements: "build/entitlements.plist", hardenedRuntime: true }) }
      : { identity: "-", identityValidation: false },
    osxNotarize: notarize
  },
  rebuildConfig: {},
  makers: [
    new MakerDMG({ format: "ULFO", title: "Margin Reader" }, ["darwin"]),
    new MakerZIP({}, ["darwin"])
  ],
  publishers: [new PublisherGithub({ repository: { owner, name }, prerelease: true, draft: true })],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        { entry: "src/electron/main.ts", config: "vite.main.config.ts", target: "main" },
        { entry: "src/electron/utility.ts", config: "vite.utility.config.ts", target: "main" },
        { entry: "src/electron/preload.ts", config: "vite.preload.config.ts", target: "preload" }
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }]
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
};

export default config;
