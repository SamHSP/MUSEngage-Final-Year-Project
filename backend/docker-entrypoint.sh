#!/bin/bash
set -e

echo "Starting MUSEngage Backend..."

# Extract MongoDB hostname from MONGODB_URI for DNS check
if [[ -n "$MONGODB_URI" ]]; then
    # Extract hostname from MongoDB URI (handles both mongodb:// and mongodb+srv://)
    MONGO_HOST=$(echo "$MONGODB_URI" | sed -E 's/mongodb(\+srv)?:\/\/([^:]+:[^@]+@)?([^\/\?]+).*/\3/' | cut -d: -f1)

    if [[ -n "$MONGO_HOST" ]]; then
        echo "Checking DNS resolution for MongoDB host: $MONGO_HOST"

        # Try to resolve the MongoDB hostname with retry logic
        MAX_DNS_RETRIES=5
        DNS_RETRY_DELAY=2

        for i in $(seq 1 $MAX_DNS_RETRIES); do
            if nslookup "$MONGO_HOST" > /dev/null 2>&1 || host "$MONGO_HOST" > /dev/null 2>&1; then
                echo "✓ Successfully resolved $MONGO_HOST"
                break
            else
                if [ $i -lt $MAX_DNS_RETRIES ]; then
                    echo "⚠ DNS resolution failed for $MONGO_HOST (attempt $i/$MAX_DNS_RETRIES). Retrying in ${DNS_RETRY_DELAY}s..."
                    sleep $DNS_RETRY_DELAY
                    DNS_RETRY_DELAY=$((DNS_RETRY_DELAY * 2))
                else
                    echo "✗ Failed to resolve $MONGO_HOST after $MAX_DNS_RETRIES attempts"
                    echo "  This may cause MongoDB connection issues"
                    echo "  Current DNS configuration:"
                    cat /etc/resolv.conf
                fi
            fi
        done
    fi
fi

# Execute the CMD from Dockerfile
exec "$@"
