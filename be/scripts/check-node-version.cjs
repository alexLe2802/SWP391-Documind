const [major, minor] = process.versions.node.split('.').map(Number);

if (major < 24 || (major === 24 && minor < 18)) {
  console.error(
    `Node.js >=24.18.0 is required. Current version: ${process.versions.node}.`,
  );
  console.error('Run `nvm use` from the repository root, then retry.');
  process.exit(1);
}
