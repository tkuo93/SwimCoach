#!/usr/bin/env python3
"""
Find the earliest commit with working authentication
"""

import subprocess
import sys

print("=== Finding working auth commit ===")
print("Testing commits backwards from d86a303")

# Check current commit first
def test_current_commit():
    result = subprocess.run(
        ['git', 'show', 'd86a303:SwimCoach-project/src/auth/passport.js'],
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

current_working = test_current_commit()
print(f"d86a303 working: {current_working}")

# Check key commits backwards (we'll check these manually)
key_commits = [
    'b414fa5',  # Fix auth issue by simplifying auth.js
    '1e4ad27',  # Add signOut function
    '9195992',  # Final auth improvements
]

print("\nChecking key commits...")
working_commits = []

for commit in key_commits:
    result = subprocess.run(
        ['git', 'show', f'{commit}:SwimCoach-project/src/auth/passport.js'],
        capture_output=True,
        text=True
    )

    if result.returncode == 0:
        content = result.stdout
        hasGoogleStrategy = 'new GoogleStrategy' in content
        hasSwimmerProfile = 'SwimmerProfile' in content
        working = hasGoogleStrategy and hasSwimmerProfile

        status = "WORKING" if working else "NOT WORKING"
        print(f"\n{commit}: {status}")
        if working:
            working_commits.append(commit)
    else:
        print(f"\n{commit}: File not found")

print(f"\n{'='*60}")
print("RESULTS:")

if working_commits:
    # Sort chronologically (earlier commits first)
    working_commits_sorted = sorted(working_commits)
    print(f"Working commits (chronological): {working_commits_sorted}")

    # The earliest working commit is the first in sorted list
    earliest_working = working_commits_sorted[0]
    print(f"\n=== EARLIEST WORKING COMMIT: {earliest_working} ===")
    print(f"\nTo find working auth, check out commit: {earliest_working}")

    # Save to file
    with open('auth_result.txt', 'w') as f:
        f.write(earliest_working)
    print(f"Saved to: auth_result.txt")
else:
    print("No working commit found in tested range")
    print("\nWe need to test more commits between these to find when auth broke")