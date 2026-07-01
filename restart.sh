#!/bin/sh
# Reliably restart the I AM THE LAW server.
# Called by the Forgejo post-receive hook AND manually.

WORK=/Users/maverick/iamthelaw
PIDFILE="$WORK/logs/server.pid"
LOG="$WORK/logs/server.log"
NODE=/Users/maverick/.local/bin/node

# Kill by process name — catches ALL stale instances regardless of port state
pkill -9 -f "node.*viewer\.js" 2>/dev/null

# Belt-and-suspenders: kill anything on port 4242
/usr/sbin/lsof -ti :4242 | xargs kill -9 2>/dev/null

# Wait until port is actually free (up to 8s)
for i in 1 2 3 4 5 6 7 8; do
  /usr/sbin/lsof -ti :4242 >/dev/null 2>&1 || break
  sleep 1
done

# Start server
nohup "$NODE" "$WORK/src/viewer.js" >> "$LOG" 2>&1 &
NEW_PID=$!
echo $NEW_PID > "$PIDFILE"
echo "[restart] Started PID $NEW_PID"
