const fs = require('fs');
const { execSync } = require('child_process');

const versionType = process.argv[2]; // 'patch', 'minor', or 'major'

if (!['patch', 'minor', 'major'].includes(versionType)) {
    console.error('Usage: node release.js [patch|minor|major]');
    process.exit(1);
}

try {
    console.log(`📦 Bumping ${versionType} version...`);

    // 1. Bump version in package.json
    execSync(`npm version ${versionType}`, { stdio: 'inherit' });

    // 2. Sync version to tauri.conf.json
    console.log('🔄 Syncing version to Tauri...');
    const pkg = require('./package.json');
    const tauriPath = './src-tauri/tauri.conf.json';
    const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
    tauri.version = pkg.version;
    fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');
    console.log(`✅ Synced version to ${pkg.version}`);

    // 3. Add tauri.conf.json to the commit
    execSync('git add ./src-tauri/tauri.conf.json', { stdio: 'inherit' });

    // 4. Amend the commit created by npm version
    execSync('git commit --amend --no-edit', { stdio: 'inherit' });

    // 5. Create/update tag
    const tag = `v${pkg.version}`;
    execSync(`git tag -f ${tag}`, { stdio: 'inherit' });
    console.log(`🏷️  Created tag: ${tag}`);

    // 6. Push changes and tags
    console.log('🚀 Pushing to GitHub...');
    execSync('git push', { stdio: 'inherit' });
    execSync('git push --tags -f', { stdio: 'inherit' });

    console.log(`\n✨ Successfully released version ${pkg.version}!`);
    console.log(`🔗 GitHub Actions will now build and deploy automatically.`);
    console.log(`📝 Check your repository's Actions tab for deployment status.`);

} catch (error) {
    console.error('❌ Release failed:', error.message);
    process.exit(1);
}
