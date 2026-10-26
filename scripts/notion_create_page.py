import json

data = {
    "pages": [
        {
            "content": "Zitsy Product Catalog\n\nProduct catalog for Zitsy (UK & Germany). Products extracted from storefront database with images downloaded locally.",
            "properties": {
                "title": {
                    "title": "Zitsy Product Catalog"
                }
            }
        }
    ],
    "parent": {
        "database_id": "6aac5b85-b045-4543-9ba3-12291c36f3da",
        "type": "database_id"
    },
    "creation_mode": "draft"
}

with open('/tmp/notion_create_page.json', 'w') as f:
    json.dump(data, f, indent=2)

print("JSON written to /tmp/notion_create_page.json")
print(json.dumps(data, indent=2))
