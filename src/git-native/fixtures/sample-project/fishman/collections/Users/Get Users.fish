{
    "id": "req_list01",
    "name": "Get Users",
    "method": "GET",
    "url": "{{baseUrl}}/users",
    "headers": [],
    "query": [
        {
            "enabled": true,
            "key": "limit",
            "value": "10"
        }
    ],
    "body": {
        "type": "none",
        "content": ""
    },
    "auth": {
        "type": "inherit"
    },
    "scripts": {
        "preRequest": "",
        "postResponse": "",
        "tests": ""
    },
    "variables": [],
    "seq": 0,
    "source": {
        "kind": "scanner",
        "locked": false,
        "routeFile": "src/routes/users.ts"
    },
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
}
