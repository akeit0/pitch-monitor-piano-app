const fs = require('fs');
const { execSync } = require('child_process');

const versionType = process.argv[2]; // 'patch', 'minor', or 'major'

if (!['patch', 'minor', 'major'].includes(versionType)) {
    console.error('Usage: node release.cjs [patch|minor|major]');
    process.exit(1);
}

function exec(command, options = {}) {
    try {
        return execSync(command, { stdio: 'inherit', ...options });
    } catch (error) {
        throw new Error(`Command failed: ${command}\n${error.message}`);
    }
}

try {
    console.log(`📦 Bumping ${versionType} version...`);

    // 1. Check if working directory is clean
    try {
        execSync('git diff-index --quiet HEAD --', { stdio: 'pipe' });
    } catch (e) {
        console.log('⚠️  Working directory has uncommitted changes. Stashing...');
        exec('git stash');
    }

    // 2. Pull latest changes
    console.log('🔄 Pulling latest changes...');
    try {
        exec('git pull --rebase');
    } catch (e) {
        console.log('⚠️  Pull failed, continuing anyway...');
    }

    // 3. Bump version in package.json
    exec(`npm version ${versionType}`);

    // 4. Sync version to tauri.conf.json
    console.log('🔄 Syncing version to Tauri...');
    const pkg = require('./package.json');
    const tauriPath = './src-tauri/tauri.conf.json';
    const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
    tauri.version = pkg.version;
    fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');
    console.log(`✅ Synced version to ${pkg.version}`);

    // 5. Add tauri.conf.json to the commit
    exec('git add ./src-tauri/tauri.conf.json');

    // 6. Amend the commit created by npm version
    exec('git commit --amend --no-edit');

    // 7. Create/update tag
    const tag = `v${pkg.version}`;
    exec(`git tag -f ${tag}`);
    console.log(`🏷️  Created tag: ${tag}`);

    // 8. Push changes and tags
    console.log('🚀 Pushing to GitHub...');
    exec('git push --force-with-lease');
    exec('git push --tags -f');

    console.log(`\n✨ Successfully released version ${pkg.version}!`);
    console.log(`🔗 GitHub Actions will now build and deploy automatically.`);
    console.log(`📝 Check: https://github.com/akeit0/piano-app/actions`);

} catch (error) {
    console.error('❌ Release failed:', error.message);
    console.log('\n💡 You may need to manually resolve conflicts and push.');
    console.log('   Run: git status');
    process.exit(1);
}
