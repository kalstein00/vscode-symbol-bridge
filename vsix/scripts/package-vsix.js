"use strict";

const fs = require("node:fs");
const path = require("node:path");
const yazl = require("yazl");

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const licensePath = path.join(rootDir, "LICENSE");
const outDir = path.join(rootDir, "out");

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function collectFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolutePath));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  files.sort();
  return files;
}

function buildContentTypesXml() {
  return [
    "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
    "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">",
    "<Default Extension=\".js\" ContentType=\"application/javascript\"/>",
    "<Default Extension=\".json\" ContentType=\"application/json\"/>",
    "<Default Extension=\".map\" ContentType=\"application/json\"/>",
    "<Default Extension=\".txt\" ContentType=\"text/plain\"/>",
    "<Default Extension=\".vsixmanifest\" ContentType=\"text/xml\"/>",
    "</Types>"
  ].join("");
}

function buildVsixManifest(pkg) {
  const categories = Array.isArray(pkg.categories) ? pkg.categories.join(",") : "";
  const repositoryUrl =
    typeof pkg.repository === "object" && pkg.repository && typeof pkg.repository.url === "string"
      ? pkg.repository.url
      : "";
  const sourceUrl = repositoryUrl.replace(/\.git$/, "");
  const supportUrl = sourceUrl ? `${sourceUrl}/issues` : "";
  const learnUrl = sourceUrl ? `${sourceUrl}#readme` : "";

  return [
    "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
    "<PackageManifest Version=\"2.0.0\" xmlns=\"http://schemas.microsoft.com/developer/vsx-schema/2011\" xmlns:d=\"http://schemas.microsoft.com/developer/vsx-schema-design/2011\">",
    "<Metadata>",
    `<Identity Language="en-US" Id="${escapeXml(pkg.name)}" Version="${escapeXml(pkg.version)}" Publisher="${escapeXml(pkg.publisher)}" />`,
    `<DisplayName>${escapeXml(pkg.displayName)}</DisplayName>`,
    `<Description xml:space="preserve">${escapeXml(pkg.description)}</Description>`,
    "<Tags></Tags>",
    `<Categories>${escapeXml(categories)}</Categories>`,
    "<GalleryFlags>Public</GalleryFlags>",
    "<Properties>",
    `<Property Id="Microsoft.VisualStudio.Code.Engine" Value="${escapeXml(pkg.engines?.vscode ?? "")}" />`,
    "<Property Id=\"Microsoft.VisualStudio.Code.ExtensionDependencies\" Value=\"\" />",
    "<Property Id=\"Microsoft.VisualStudio.Code.ExtensionPack\" Value=\"\" />",
    "<Property Id=\"Microsoft.VisualStudio.Code.ExtensionKind\" Value=\"workspace\" />",
    "<Property Id=\"Microsoft.VisualStudio.Code.LocalizedLanguages\" Value=\"\" />",
    "<Property Id=\"Microsoft.VisualStudio.Code.EnabledApiProposals\" Value=\"\" />",
    "<Property Id=\"Microsoft.VisualStudio.Code.ExecutesCode\" Value=\"true\" />",
    sourceUrl ? `<Property Id="Microsoft.VisualStudio.Services.Links.Source" Value="${escapeXml(sourceUrl)}" />` : "",
    sourceUrl ? `<Property Id="Microsoft.VisualStudio.Services.Links.Getstarted" Value="${escapeXml(sourceUrl)}" />` : "",
    sourceUrl ? `<Property Id="Microsoft.VisualStudio.Services.Links.GitHub" Value="${escapeXml(sourceUrl)}" />` : "",
    supportUrl ? `<Property Id="Microsoft.VisualStudio.Services.Links.Support" Value="${escapeXml(supportUrl)}" />` : "",
    learnUrl ? `<Property Id="Microsoft.VisualStudio.Services.Links.Learn" Value="${escapeXml(learnUrl)}" />` : "",
    "<Property Id=\"Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown\" Value=\"true\" />",
    "<Property Id=\"Microsoft.VisualStudio.Services.Content.Pricing\" Value=\"Free\"/>",
    "</Properties>",
    "<License>extension/LICENSE.txt</License>",
    "</Metadata>",
    "<Installation>",
    "<InstallationTarget Id=\"Microsoft.VisualStudio.Code\"/>",
    "</Installation>",
    "<Dependencies/>",
    "<Assets>",
    "<Asset Type=\"Microsoft.VisualStudio.Code.Manifest\" Path=\"extension/package.json\" Addressable=\"true\" />",
    "<Asset Type=\"Microsoft.VisualStudio.Services.Content.License\" Path=\"extension/LICENSE.txt\" Addressable=\"true\" />",
    "</Assets>",
    "</PackageManifest>"
  ]
    .filter(Boolean)
    .join("");
}

function createVsix() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const outFile = path.join(rootDir, `${pkg.name}-${pkg.version}.vsix`);
  const zipFile = new yazl.ZipFile();

  zipFile.addBuffer(Buffer.from(buildContentTypesXml(), "utf8"), "[Content_Types].xml");
  zipFile.addBuffer(Buffer.from(buildVsixManifest(pkg), "utf8"), "extension.vsixmanifest");
  zipFile.addFile(packageJsonPath, "extension/package.json");
  zipFile.addFile(licensePath, "extension/LICENSE.txt");

  for (const filePath of collectFiles(outDir)) {
    const relativePath = path.relative(rootDir, filePath);
    zipFile.addFile(filePath, toPosixPath(path.join("extension", relativePath)));
  }

  zipFile.end();

  return new Promise((resolve, reject) => {
    const outputStream = fs.createWriteStream(outFile);
    zipFile.outputStream
      .pipe(outputStream)
      .on("close", () => resolve(outFile))
      .on("error", reject);
  });
}

async function main() {
  if (!fs.existsSync(outDir)) {
    throw new Error("Build output not found. Run `npm run build` first.");
  }

  const outFile = await createVsix();
  console.log(`Packaged: ${outFile}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
