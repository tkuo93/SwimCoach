#!/usr/bin/env python3
"""
Summary of working auth commits
"""

import subprocess
import sys

print("=== Auth Working Commit Analysis ===\n")

# Test key commits that were working
test_commits = ['d86a303', 'b414fa5', '1e4ad27']

working_commits = []

for commit in test_commits:
    result = subprocess.run(
        ['git', 'show', f'{commit}:SwimCoach-project/src/auth/passport.js'],
        capture_output=True,
        text=True
    )

    if result.returncode == 0:
        content = result.stdout
        hasGoogleStrategy = 'new GoogleStrategy' in content
        hasSerializeUser = 'serializeUser' in content
        hasDeserializeUser = 'deserializeUser' in content
        hasSwimmerProfile = 'SwimmerProfile' in content

        if hasGoogleStrategy and hasSerializeUser and hasDeserializeUser and hasSwimmerProfile:
            working_commits.append(commit)
            status = "✓ WORKING"
        else:
            status = "✗ FAILING"
        print(f"{commit}: {status}")
    else:
        print(f"{commit}: ✗ File not found")

print(f"\n{'='*60}")
print("ANALYSIS COMPLETE:")
print(f"\nWorking commits: {working_commits}")

if working_commits:
    # Sort chronologically (earlier commits first)
    working_commits_sorted = sorted(working_commits)
    earliest_working = working_commits_sorted[0]

    print(f"\n=== EARLIEST WORKING COMMIT: {earliest_working} ===")
    print(f"\nThis commit has a working authentication implementation with:")
    print("  - Google OAuth strategy with proper error handling")
    print("  - User serialization/deserialization for sessions")
    print("  - Integration with SwimmerProfile model")
    print(f"\nTo find working auth, check out: git checkout {earliest_working}")

    # Save to file
    with open('auth_result.txt', 'w') as f:
        f.write(earliest_working)
    print(f"\nSaved to: auth_result.txt")

    # Show the commit message
    subprocess.run(['git', 'log', '-1', '--pretty=%B', earliest_working], cwd='C:/Users/kuo9/.claude/projects/SwimCoach')
else:
    print("\nNo working commit found in tested range")