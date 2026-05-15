# Testing Guide - Padix

## Quick Start

### Create Complete Demo Setup
```bash
# 1. Create 10 test users + 5 completed games
bash setup-future-games.sh

# 2. Login with demo credentials
# Email: user1@test.com
# Password: test123
```

### For Daily Testing

#### Create Incomplete Games (Ready to Auto-Complete)
```bash
# Creates 3 unfinished games for 2026-04-23
bash create-incomplete-games.sh
```

#### Auto-Complete Games (Single Command)
```bash
# Automatically completes all unfinished games on a date
bash auto-complete-games.sh 2026-04-23
```

## Available Scripts

### `setup-future-games.sh`
- Creates 5 complete games for tomorrow (2026-04-22)
- Automatically:
  - Creates games
  - Registers players
  - Starts games
  - Scores all matches
  - Finishes games
- **Used for**: Initial setup, fresh demo

### `create-incomplete-games.sh`
- Creates 3 unfinished games for tomorrow
- Leaves them in OPEN_FOR_REGISTRATION state
- **Used for**: Testing the auto-complete workflow

### `auto-complete-games.sh`
```bash
bash auto-complete-games.sh <YYYY-MM-DD>
```
- Finds all unfinished games on a specific date
- Automatically completes them with realistic data
- **Used for**: Daily/repeated testing without API code changes

## Test Users

Default users created by scripts:
- `user1@test.com` / `test123` 
- `user2@test.com` / `test123`
- ... through `user10@test.com`

Or use demo users:
- `demo1@test.com` / `demo123`
- `demo2@test.com` / `demo123`
- ... through `demo10@test.com`

## What Gets Completed?

When you run `auto-complete-games.sh`, each game gets:
1. ✅ All players registered
2. ✅ Game started (pairings created)
3. ✅ All matches scored (21-15 for team A)
4. ✅ Game finished and moved to history

## Testing Tips

1. **First time setup:**
   ```bash
   bash setup-future-games.sh
   ```

2. **Create fresh incomplete games:**
   ```bash
   bash create-incomplete-games.sh
   ```

3. **Complete them instantly:**
   ```bash
   bash auto-complete-games.sh 2026-04-23
   ```

4. **No need to touch the API code** - just use these scripts!

## Example Workflow

```bash
# 1. Start with demo data
bash setup-future-games.sh

# 2. Open http://localhost:8081
# 3. Login: user1@test.com / test123
# 4. See 5 completed games ready to test

# 5. Next testing cycle, create new incomplete games
bash create-incomplete-games.sh

# 6. Auto-complete them
bash auto-complete-games.sh 2026-04-24

# 7. Login again and test fresh data
```

## No Complex Setup Needed!

✨ **That's it!** No need for:
- curl commands
- Manual API calls
- Waiting for data
- Complex admin endpoints

Just run the scripts and test!
