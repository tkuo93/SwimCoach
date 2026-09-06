#!/usr/bin/env python3
"""
Find the earliest commit with working authentication
"""

import subprocess
import sys

print("=== Finding working auth commit ===")
print("Testing commits backwards from d86a303")

# Test each commit
def test_commit(commit_hash):
    result = subprocess.run(
        ['git', 'show', f'{commit_hash}:SwimCoach-project/src/auth/passport.js'],
        capture_output=True,
        text=True
    )
    if result.returncode == 0:
        content = result.stdout
        hasGoogleStrategy = 'new GoogleStrategy' in content
        hasSerializeUser = 'serializeUser' in content
        hasDeserializeUser = 'deserializeUser' in content
        hasSwimmerProfile = 'SwimmerProfile' in content
        return hasGoogleStrategy and hasSerializeUser and hasDeserializeUser and hasSwimmerProfile
    return False

# Start with current commit
test_commits = ['d86a303']

# Add commits backwards (earlier commits go before current in git log)
key_commits = ['b414fa5', '1e4ad27', '9195992', '2efc325', '61276cc', '9a8dd8c', '1d2a625', '6ee785b', '2a3d9b0', '330147e', '10070c1', 'a214727']
test_commits.extend(key_commits)

working_commits = []

for commit in test_commits:
    working = test_commit(commit)
    if working:
        working_commits.append(commit)
        print(f"{commit}: ✓ WORKING")
    else:
        print(f"{commit}: ✗ FAILING")

print(f"\n{'='*60}")
print("RESULTS:")

if working_commits:
    # Sort chronologically (earlier commits first)
    working_commits_sorted = sorted(working_commits)
    print(f"Working commits (chronological): {working_commits_sorted}")

    earliest_working = working_commits_sorted[0]
    print(f"\n=== EARLIEST WORKING COMMIT: {earliest_working} ===")
    print(f"\nTo find working auth, check out commit: {earliest_working}")

    # Save to file
    with open('C:\\Users\\tkuo9\\.claude\\projects\\SwimCoach\\auth_result.txt', 'w') as f:
        f.write(earliest_working)
    print(f"Saved to: auth_result.txt")
else:
    print("No working commit found in tested range")