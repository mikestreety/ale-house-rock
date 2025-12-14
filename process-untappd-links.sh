#!/bin/bash

# Directory containing the markdown files
BEER_DIR="app/content/beer"

# Counter for processed files
processed=0
updated=0
skipped=0

echo "Processing markdown files in $BEER_DIR..."
echo ""

# Get all markdown files and reverse the order
files=($(ls -r "$BEER_DIR"/*.md 2>/dev/null))

# Loop through all markdown files in reverse order
for file in "${files[@]}"; do
    if [ ! -f "$file" ]; then
        continue
    fi

    filename=$(basename "$file")

    # Check if file contains canonical with untappd.com
    if grep -q "canonical.*untappd\.com" "$file"; then
        # Skip if file already has untappd_link
        if grep -q '"untappd_link"' "$file" || grep -q "^untappd_link:" "$file"; then
            echo "Skipping: $filename (already has untappd_link)"
            ((skipped++))
            continue
        fi

        echo "Processing: $filename"

        # Extract the canonical URL (handles both YAML and JSON format)
        canonical_url=$(grep -o '"canonical"[[:space:]]*:[[:space:]]*"[^"]*"' "$file" | sed 's/"canonical"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' | tr -d '\r')

        # If JSON format didn't match, try YAML format
        if [ -z "$canonical_url" ]; then
            canonical_url=$(grep "^canonical:" "$file" | sed 's/canonical: *//' | tr -d '\r')
        fi

        # Check if it's an untappd.com URL
        if [[ $canonical_url == https://untappd.com/* ]]; then
            # Replace untappd.com with untappd.alehouse.rocks
            new_url="${canonical_url/untappd.com/untappd.alehouse.rocks}"

            echo "  Original URL: $canonical_url"
            echo "  New URL: $new_url"

            # Fetch the new URL
            response=$(curl -s "$new_url")

            # Extract untappd_link from response (assuming JSON response)
            untappd_link=$(echo "$response" | grep -o '"untappd_link"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"untappd_link"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')

            if [ -n "$untappd_link" ]; then
                echo "  Found untappd_link: $untappd_link"
                echo "  Adding untappd_link..."

                # Check if file uses JSON or YAML format
                if grep -q '"canonical"' "$file"; then
                    # JSON format - add after canonical line
                    sed -i.bak "/\"canonical\":/a\\
  \"untappd_link\": \"$untappd_link\",
" "$file"
                else
                    # YAML format - add after canonical line
                    sed -i.bak "/^canonical:/a\\
untappd_link: $untappd_link
" "$file"
                fi

                # Remove backup file
                rm "${file}.bak"

                ((updated++))
                ((processed++))
                echo "  ✓ Updated successfully"
            else
                echo "  ✗ No untappd_link found in response"
                ((skipped++))
            fi
        else
            echo "  Skipping: Not an untappd.com URL"
            ((skipped++))
        fi

        echo ""

        # Add a small delay to avoid overwhelming the server
        sleep 0.5
    fi
done

echo "================================"
echo "Summary:"
echo "  Files processed: $processed"
echo "  Files updated: $updated"
echo "  Files skipped: $skipped"
echo "================================"
