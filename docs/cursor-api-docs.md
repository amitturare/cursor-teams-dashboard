# Cursor APIs Overview

Cursor provides multiple APIs for programmatic access to your team's data, AI-powered coding agents, and analytics.

## Available APIs

APIDescriptionAvailability[Admin API](/docs/account/teams/admin-api)Manage team members, settings, usage data, and spending. Build custom dashboards and monitoring tools.Enterprise teams[Analytics API](/docs/account/teams/analytics-api)Comprehensive insights into team's Cursor usage, AI metrics, active users, and model usage.Enterprise teams[AI Code Tracking API](/docs/account/teams/ai-code-tracking-api)Track AI-generated code contributions at commit and change levels for attribution and analytics.Enterprise teams[Cloud Agents API](/docs/cloud-agent/api/endpoints)Programmatically create and manage AI-powered coding agents for automated workflows and code generation.Beta (All Plans)
## Authentication

All Cursor APIs use Basic Authentication.

### Basic Authentication

Use your API key as the username in basic authentication (leave password empty):

```
curl https://api.cursor.com/teams/members \
  -u YOUR_API_KEY:
```

Or set the Authorization header directly:

```
Authorization: Basic {base64_encode('YOUR_API_KEY:')}
```

### Creating API Keys

API keys are created from your team settings. Only team administrators can create and manage API keys.

#### Admin API & AI Code Tracking API

1. Navigate to **cursor.com/dashboard** → **Settings** tab → **Advanced** → **Admin API Keys**
2. Click **Create New API Key**
3. Give your key a descriptive name (e.g., "Usage Dashboard Integration")
4. Copy the generated key immediately - you won't see it again

Key format: `key_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

#### Analytics API

Generate an API key from your [team settings page](https://cursor.com/settings).

#### Cloud Agents API

Create an API key from [Cursor Dashboard → Cloud Agents](https://cursor.com/dashboard/cloud-agents).

API keys are tied to your organization and viewable by all admins. Keys are unaffected by the original creator's account status.

## Rate Limits

All APIs implement rate limiting to ensure fair usage and system stability. Rate limits are enforced per team and reset every minute.

### Rate Limits by API

APIEndpoint TypeRate Limit**Admin API**Most endpoints20 requests/minute**Admin API**`/teams/user-spend-limit`250 requests/minute**Analytics API**Most team-level endpoints100 requests/minute**Analytics API**`/analytics/team/conversation-insights`20 requests/minute**Analytics API**By-user endpoints50 requests/minute**AI Code Tracking API**All endpoints20 requests/minute per endpoint**Cloud Agents API**All endpointsStandard rate limiting
### Rate Limit Response

When you exceed the rate limit, you'll receive a `429 Too Many Requests` response:

```
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

## Caching

Several APIs support HTTP caching with ETags to reduce bandwidth usage and improve performance.

### Supported APIs

- **Analytics API**: All endpoints (both team-level and by-user) support HTTP caching
- **AI Code Tracking API**: Endpoints support HTTP caching

### How Caching Works

1. **Initial Request**: Make a request to any supported endpoint
2. **Response Includes ETag**: The API returns an `ETag` header in the response
3. **Subsequent Requests**: Include the `ETag` value in an `If-None-Match` header
4. **304 Not Modified**: If data hasn't changed, you'll receive a `304 Not Modified` response with no body

### Example

```
# Initial request
curl -X GET "https://api.cursor.com/analytics/team/dau" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -D headers.txt

# Response includes: ETag: "abc123xyz"

# Subsequent request with ETag
curl -X GET "https://api.cursor.com/analytics/team/dau" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "If-None-Match: \"abc123xyz\""

# Returns 304 Not Modified if data hasn't changed
```

### Cache Duration

- Cache duration: 15 minutes (`Cache-Control: public, max-age=900`)
- Responses include an `ETag` header
- Include `If-None-Match` header in subsequent requests to receive `304 Not Modified` when data hasn't changed

### Benefits

- **Reduces bandwidth usage**: 304 responses contain no body
- **Faster responses**: Avoids processing unchanged data
- **Rate limit friendly**: 304 responses don't count against rate limits
- **Better performance**: Especially useful for frequently polled endpoints

## Best Practices

### 1. Implement Exponential Backoff

When you receive a 429 response, wait before retrying with increasing delays:

```
import time
import requests

def make_request_with_backoff(url, headers, max_retries=5):
    for attempt in range(max_retries):
        response = requests.get(url, headers=headers)
        
        if response.status_code == 429:
            # Exponential backoff: 1s, 2s, 4s, 8s, 16s
            wait_time = 2 ** attempt
            print(f"Rate limited. Waiting {wait_time}s before retry...")
            time.sleep(wait_time)
            continue
            
        return response
    
    raise Exception("Max retries exceeded")
```

### 2. Distribute Requests Over Time

Spread your API calls over time rather than making burst requests:

- Schedule batch jobs to run at different intervals
- Add delays between requests when processing large datasets
- Use queuing systems to smooth out traffic spikes

### 3. Leverage Caching

**For Analytics API and AI Code Tracking API:**

These APIs support HTTP caching with ETags. See the [Caching](#caching) section above for details on how to use ETags to reduce bandwidth usage and avoid unnecessary requests.

**Key benefits:**

- Reduces bandwidth usage
- Faster responses when data hasn't changed
- Doesn't count against rate limits (for 304 responses)

Use date shortcuts (`7d`, `30d`) instead of timestamps for better caching support in Analytics API.

### 4. Monitor Your Usage

Track your request patterns to stay within limits:

- Log API call timestamps and response codes
- Set up alerts for 429 responses
- Monitor daily/weekly usage trends
- Adjust polling intervals based on actual needs

### 5. Batch Wisely

For endpoints with pagination:

- Use appropriate page sizes to get more data per request
- For Analytics API by-user endpoints: Use `users` parameter to filter specific users
- For large data extractions: Use CSV endpoints when available (they stream data efficiently)

### 6. Poll at Appropriate Intervals

Don't over-poll endpoints that update infrequently:

- **Admin API** `/teams/daily-usage-data`: Poll at most once per hour (data aggregated hourly)
- **Admin API** `/teams/filtered-usage-events`: Poll at most once per hour (data aggregated hourly)
- **Analytics API**: Use date shortcuts (`7d`, `30d`) for better caching support
- **AI Code Tracking API**: Data is ingested in near real-time but polling every few minutes is sufficient

### 7. Handle Errors Gracefully

Implement proper error handling for all API calls:

```
async function fetchAnalytics(endpoint) {
  try {
    const response = await fetch(`https://api.cursor.com${endpoint}`, {
      headers: {
        'Authorization': `Basic ${btoa(API_KEY + ':')}`
      }
    });
    
    if (response.status === 429) {
      // Rate limited - implement backoff
      throw new Error('Rate limit exceeded');
    }
    
    if (response.status === 401) {
      // Invalid API key
      throw new Error('Authentication failed');
    }
    
    if (response.status === 403) {
      // Insufficient permissions
      throw new Error('Enterprise access required');
    }
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}
```

## Common Error Responses

All APIs use standard HTTP status codes:

### 400 Bad Request

Request parameters are invalid or missing required fields.

```
{
  "error": "Bad Request",
  "message": "Some users are not in the team"
}
```

### 401 Unauthorized

Invalid or missing API key.

```
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

### 403 Forbidden

Valid API key but insufficient permissions (e.g., Enterprise features on non-Enterprise plan).

```
{
  "error": "Forbidden",
  "message": "Enterprise access required"
}
```

### 404 Not Found

Requested resource doesn't exist.

```
{
  "error": "Not Found",
  "message": "Resource not found"
}
```

### 429 Too Many Requests

Rate limit exceeded. Implement exponential backoff.

```
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

### 500 Internal Server Error

Server-side error. Contact support if persistent.

```
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred"
}
```


# Admin API

The Admin API lets you programmatically access your team's data, including member information, usage metrics, and spending details.

- The Admin API uses [Basic Authentication](/docs/api#basic-authentication) with your API key as the username.
- For details on creating API keys, authentication methods, rate limits, and best practices, see the [API Overview](/docs/api).

## Endpoints

### Get Team Members

GET`/teams/members`Retrieve all team members and their details.

#### Response Fields

`teamMembers` array

Array of team member objects, each containing:- `id` number - Unique identifier for the team member
- `email` string - Email address of the team member
- `name` string - Display name of the team member
- `role` string - Role in the team (e.g., `member`, `owner`)
- `isRemoved` boolean - Whether the member has been removed from the team

```
curl -X GET https://api.cursor.com/teams/members \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "teamMembers": [
    {
      "id": 12345,
      "name": "Alex",
      "email": "developer@company.com",
      "role": "member",
      "isRemoved": false
    },
    {
      "id": 12346,
      "name": "Sam",
      "email": "admin@company.com",
      "role": "owner",
      "isRemoved": false
    }
  ]
}
```

### Get Audit Logs

GET`/teams/audit-logs`Retrieve audit log events for your team with filtering. Track team activity, security events, and configuration changes. Rate limited to 20 requests per minute per team. See [rate limits and best practices](/docs/api#rate-limits).

#### Parameters

`startTime` string | number

Start time (defaults to 7 days ago). See [Date Formats](#date-formats)`endTime` string | number

End time (defaults to now). See [Date Formats](#date-formats)`eventTypes` string

Comma-separated event types to filter by. Possible values: `login`, `logout`, `add_user`, `remove_user`, `update_user_role`, `team_settings`, `team_api_key`, `user_api_key`, `privacy_mode`, `user_spend_limit`, `team_rule`, `team_repo`, `team_hook`, `team_command`, `create_directory_group`, `delete_directory_group`, `update_directory_group`, `update_directory_group_permissions`, `add_user_to_directory_group`, `remove_user_from_directory_group`, `bugbot_installation`, `bugbot_installation_settings`, `bugbot_repo_settings`, `bugbot_team_rule`, `bugbot_team_settings`, `bugbot_bulk_repo_update``search` string

Search term to filter events`page` number

Page number (1-indexed). Default: `1``pageSize` number

Results per page (1-500). Default: `100``users` string

Filter by users. See [User Filtering](#user-filtering) belowDate range cannot exceed 30 days. Make multiple requests for longer periods.

#### Date Formats

The `startTime` and `endTime` parameters support multiple formats:

- **Relative shortcuts**: `now`, `today`, `yesterday`, `7d` (7 days ago), `5h` (5 hours ago), `300s` (300 seconds ago)
- **ISO 8601 strings**: `2024-01-15T12:00:00Z` or `2024-01-15T10:00:00-05:00`
- **YYYY-MM-DD format**: `2024-01-15` (time defaults to 00:00:00 UTC)
- **Unix timestamps**: `1705315200` (seconds) or `1705315200000` (milliseconds)

**Examples:**

- `?startTime=7d&endTime=now` - Last 7 days
- `?startTime=5h&endTime=now` - Last 5 hours
- `?startTime=2024-01-15&endTime=2024-01-20` - Specific date range
- `?startTime=1705315200000&endTime=1705401600000` - Unix timestamps

#### User Filtering

The `users` parameter accepts multiple formats, comma-separated:

- **Email addresses**: `developer@company.com,admin@company.com`
- **Encoded user IDs**: `user_PDSPmvukpYgZEDXsoNirw3CFhy,user_kljUvI0ASZORvSEXf9hV0ydcso`

You can mix formats: `developer@company.com,12345,user_PDSPmvukpYgZEDXsoNirw3CFhy`

Maximum number of users per request equals `pageSize`.

```
curl -X GET "https://api.cursor.com/teams/audit-logs?users=admin@company.com,developer@company.com&eventTypes=login,add_user" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "events": [
    {
      "event_id": "evt_abc123",
      "timestamp": "2024-01-15T12:30:00.000Z",
      "ip_address": "203.0.113.42",
      "user_email": "admin@company.com",
      "event_type": "add_user",
      "event_data": {
        "email": "admin@company.com",
        "method": "manual"
      }
    },
    {
      "event_id": "evt_def456",
      "timestamp": "2024-01-15T10:15:00.000Z",
      "ip_address": "192.168.1.1",
      "user_email": "developer@company.com",
      "event_type": "login",
      "event_data": {
        "ip_address": "192.168.1.1",
        "user_agent": "Cursor/0.42.0"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 100,
    "totalCount": 2,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "params": {
    "teamId": 12345,
    "startDate": 1704729600000,
    "endDate": 1705334400000
  }
}
```

### Get Daily Usage Data

POST`/teams/daily-usage-data`Retrieve daily usage metrics for your team. Data is aggregated at the hourly level - we recommend polling this endpoint at most once per hour. Rate limited to 20 requests per minute per team. See [best practices](/docs/api#best-practices).

#### Parameters

`startDate` number Required

Start date in epoch milliseconds`endDate` number Required

End date in epoch milliseconds`page` number

Page number (1-indexed). When provided along with `pageSize`, enables pagination and returns data for **all team members with a membership during the requested date range**.`pageSize` number

Number of users per page. When provided along with `page`, enables pagination and returns data for **all team members with a membership during the requested date range**.Without pagination parameters, this endpoint only returns **active users** (those with activity during the date range). To get **all team members**, include both `page` and `pageSize` parameters.

When using pagination, the response includes an `isActive` field for each user indicating whether they had activity on that day. Members who joined after the requested period are excluded.

Date range cannot exceed 30 days. Make multiple requests for longer periods.

The fields `subscriptionIncludedReqs`, `usageBasedReqs`, and `apiKeyReqs` count raw usage events, not billable request units in older request-based pricing. To get accurate billable request counts, use the [`/teams/filtered-usage-events`](#get-usage-events-data) endpoint and sum the `requestsCosts` field.

#### Response Fields

Each object in the `data` array contains:

- `userId` number - Unique identifier for the user
- `day` string - The date this record covers (ISO date, e.g., `2024-03-18`)
- `date` number - Date as epoch milliseconds
- `email` string - User's email address
- `isActive` boolean - Whether the user had activity on this day (only present with pagination)
- `totalLinesAdded` number - Total lines of code added
- `totalLinesDeleted` number - Total lines of code deleted
- `acceptedLinesAdded` number - AI-suggested lines added that were accepted
- `acceptedLinesDeleted` number - AI-suggested lines deleted that were accepted
- `totalApplies` number - Total AI code apply actions
- `totalAccepts` number - Total accepted AI suggestions
- `totalRejects` number - Total rejected AI suggestions
- `totalTabsShown` number - Total Tab completions shown to the user
- `totalTabsAccepted` number - Total Tab completions accepted by the user
- `composerRequests` number - Number of Composer requests made
- `chatRequests` number - Number of chat requests made
- `agentRequests` number - Number of Agent mode requests made
- `cmdkUsages` number - Number of Cmd+K inline edit usages
- `subscriptionIncludedReqs` number - Requests included in the subscription plan
- `apiKeyReqs` number - Requests made via API key
- `usageBasedReqs` number - Usage-based (overage) requests
- `bugbotUsages` number - Number of Bugbot usages
- `mostUsedModel` string | null - Most frequently used AI model for the day
- `applyMostUsedExtension` string | null - Most common file extension for apply actions
- `tabMostUsedExtension` string | null - Most common file extension for Tab completions
- `clientVersion` string | null - Cursor client version used

```
# Get data for active users only (no pagination)
curl -X POST https://api.cursor.com/teams/daily-usage-data \
  -u YOUR_API_KEY: \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": 1710720000000,
    "endDate": 1710892800000
  }'

# Get data for ALL team members (with pagination)
curl -X POST https://api.cursor.com/teams/daily-usage-data \
  -u YOUR_API_KEY: \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": 1710720000000,
    "endDate": 1710892800000,
    "page": 1,
    "pageSize": 1000
  }'
```

**Response (without pagination - active users only):**

```
{
  "data": [
    {
      "userId": 12345,
      "day": "2024-03-18",
      "date": 1710720000000,
      "isActive": true,
      "totalLinesAdded": 1543,
      "totalLinesDeleted": 892,
      "acceptedLinesAdded": 1102,
      "acceptedLinesDeleted": 645,
      "totalApplies": 87,
      "totalAccepts": 73,
      "totalRejects": 14,
      "totalTabsShown": 342,
      "totalTabsAccepted": 289,
      "composerRequests": 45,
      "chatRequests": 128,
      "agentRequests": 12,
      "cmdkUsages": 67,
      "subscriptionIncludedReqs": 180,
      "apiKeyReqs": 0,
      "usageBasedReqs": 5,
      "bugbotUsages": 3,
      "mostUsedModel": "gpt-5",
      "applyMostUsedExtension": ".tsx",
      "tabMostUsedExtension": ".ts",
      "clientVersion": "0.25.1",
      "email": "developer@company.com"
    }
  ],
  "period": {
    "startDate": 1710720000000,
    "endDate": 1710892800000
  }
}
```

**Response (with pagination - all team members):**

```
{
  "data": [
    {
      "userId": 12345,
      "day": "2024-03-18",
      "date": 1710720000000,
      "isActive": true,
      "totalLinesAdded": 1543,
      "totalLinesDeleted": 892,
      "acceptedLinesAdded": 1102,
      "acceptedLinesDeleted": 645,
      "totalApplies": 87,
      "totalAccepts": 73,
      "totalRejects": 14,
      "totalTabsShown": 342,
      "totalTabsAccepted": 289,
      "composerRequests": 45,
      "chatRequests": 128,
      "agentRequests": 12,
      "cmdkUsages": 67,
      "subscriptionIncludedReqs": 180,
      "apiKeyReqs": 0,
      "usageBasedReqs": 5,
      "bugbotUsages": 3,
      "mostUsedModel": "gpt-5",
      "applyMostUsedExtension": ".tsx",
      "tabMostUsedExtension": ".ts",
      "clientVersion": "0.25.1",
      "email": "developer@company.com"
    },
    {
      "userId": 12346,
      "day": "2024-03-18",
      "date": 1710720000000,
      "isActive": false,
      "totalLinesAdded": 0,
      "totalLinesDeleted": 0,
      "acceptedLinesAdded": 0,
      "acceptedLinesDeleted": 0,
      "totalApplies": 0,
      "totalAccepts": 0,
      "totalRejects": 0,
      "totalTabsShown": 0,
      "totalTabsAccepted": 0,
      "composerRequests": 0,
      "chatRequests": 0,
      "agentRequests": 0,
      "cmdkUsages": 0,
      "subscriptionIncludedReqs": 0,
      "apiKeyReqs": 0,
      "usageBasedReqs": 0,
      "bugbotUsages": 0,
      "mostUsedModel": null,
      "applyMostUsedExtension": null,
      "tabMostUsedExtension": null,
      "clientVersion": null,
      "email": "inactive-user@company.com"
    }
  ],
  "period": {
    "startDate": 1710720000000,
    "endDate": 1710892800000
  },
  "pagination": {
    "page": 1,
    "pageSize": 1000,
    "totalUsers": 150,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

### Get Spending Data

POST`/teams/spend`Retrieve spending information for the current billing cycle with search, sorting, and pagination.

#### Parameters

`searchTerm` string

Search in user names and emails`sortBy` string

Sort by: `amount`, `date`, `user`. Default: `date``sortDirection` string

Sort direction: `asc`, `desc`. Default: `desc``page` number

Page number (1-indexed). Default: `1``pageSize` number

Results per page#### Response Fields

Each object in `teamMemberSpend` contains:

- `userId` number - Unique identifier for the user
- `name` string - Display name of the user
- `email` string - Email address of the user
- `role` string - Role in the team (e.g., `member`, `owner`)
- `spendCents` number - On-demand spend in cents for the current billing cycle (excludes included usage)
- `overallSpendCents` number - Total spend in cents for the current billing cycle, including both on-demand and included usage
- `fastPremiumRequests` number - Number of usage-based premium requests made during the billing cycle
- `hardLimitOverrideDollars` number - Custom hard spending limit override in dollars for this user (0 means no override)
- `monthlyLimitDollars` number | null - Monthly spending limit in dollars set for this user, or `null` if no limit is set

```
curl -X POST https://api.cursor.com/teams/spend \
  -u YOUR_API_KEY: \
  -H "Content-Type: application/json" \
  -d '{
    "searchTerm": "alex@company.com",
    "page": 2,
    "pageSize": 25
  }'
```

**Response:**

```
{
  "teamMemberSpend": [
    {
      "userId": 12345,
      "spendCents": 2450,
      "overallSpendCents": 2450,
      "fastPremiumRequests": 1250,
      "name": "Alex",
      "email": "developer@company.com",
      "role": "member",
      "hardLimitOverrideDollars": 100,
      "monthlyLimitDollars": 200
    },
    {
      "userId": 12346,
      "spendCents": 1875,
      "overallSpendCents": 3200,
      "fastPremiumRequests": 980,
      "name": "Sam",
      "email": "admin@company.com",
      "role": "owner",
      "hardLimitOverrideDollars": 0,
      "monthlyLimitDollars": null
    }
  ],
  "subscriptionCycleStart": 1708992000000,
  "totalMembers": 15,
  "totalPages": 1
}
```

### Get Usage Events Data

POST`/teams/filtered-usage-events`Retrieve detailed usage events for your team with comprehensive filtering, search, and pagination options. This endpoint provides granular insights into individual API calls, model usage, token consumption, and costs. Data is aggregated at the hourly level - we recommend polling this endpoint at most once per hour. Rate limited to 20 requests per minute per team. See [best practices](/docs/api#best-practices).

**Cost Calculation**: To reconcile event-level costs with `/teams/spend` totals, sum the `chargedCents` field across events. This field includes both the model cost and the Cursor Token Fee (if applicable), matching the dashboard totals. It works for both token-based and request-based billing plans.

The `cursorTokenFee` field is only present for teams with Cursor Token Fee enabled. For request-based enterprise accounts, this field may not appear in the response.

#### Parameters

`startDate` number

Start date in epoch milliseconds`endDate` number

End date in epoch milliseconds`userId` number

Filter by specific user ID`page` number

Page number (1-indexed). Default: `1``pageSize` number

Number of results per page. Default: `10``email` string

Filter by user email address#### Response Fields

Each object in `usageEvents` contains:

- `timestamp` string - Event timestamp in epoch milliseconds (as a string)
- `userEmail` string - Email address of the user who made the request
- `model` string - AI model used for the request
- `kind` string - Billing category (e.g., `Usage-based`, `Included in Business`)
- `maxMode` boolean - Whether the request used max mode
- `requestsCosts` number - Cost in request units
- `isTokenBasedCall` boolean - Whether the request was billed by token usage
- `isChargeable` boolean - Whether this event incurs a charge
- `isHeadless` boolean - Whether this request was made without a connected client (e.g., background agents)
- `tokenUsage` object | undefined - Token usage details (present when `isTokenBasedCall` is `true`):
- `inputTokens` number - Input tokens consumed
- `outputTokens` number - Output tokens generated
- `cacheWriteTokens` number - Tokens written to cache
- `cacheReadTokens` number - Tokens read from cache
- `totalCents` number - Total model cost in cents
- `discountPercentOff` number | undefined - Discount percentage applied, if any
- `chargedCents` number - Total amount charged in cents for this event (model cost + Cursor Token Fee if applicable). Use this field to reconcile event-level costs with `/teams/spend` totals. Works for both token-based and request-based billing plans.
- `cursorTokenFee` number | undefined - Cursor Token Fee in cents (only present for teams with token fee enabled)
- `isFreeBugbot` boolean - Whether this was a free Bugbot request

```
curl -X POST https://api.cursor.com/teams/filtered-usage-events \
  -u YOUR_API_KEY: \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": 1748411762359,
    "endDate": 1751003762359,
    "email": "developer@company.com",
    "page": 1,
    "pageSize": 25
  }'
```

**Response:**

```
{
  "totalUsageEventsCount": 113,
  "pagination": {
    "numPages": 12,
    "currentPage": 1,
    "pageSize": 10,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "usageEvents": [
    {
      "timestamp": "1750979225854",
      "userEmail": "developer@company.com",
      "model": "claude-4.5-sonnet",
      "kind": "Usage-based",
      "maxMode": true,
      "requestsCosts": 5,
      "isTokenBasedCall": true,
      "isChargeable": true,
      "isHeadless": false,
      "tokenUsage": {
        "inputTokens": 126,
        "outputTokens": 450,
        "cacheWriteTokens": 6112,
        "cacheReadTokens": 11964,
        "totalCents": 20.18232
      },
      "chargedCents": 21.36232,
      "cursorTokenFee": 1.18,
      "isFreeBugbot": false
    },
    {
      "timestamp": "1750979173824",
      "userEmail": "developer@company.com",
      "model": "claude-4.5-sonnet",
      "kind": "Usage-based",
      "maxMode": true,
      "requestsCosts": 10,
      "isTokenBasedCall": true,
      "isChargeable": true,
      "isHeadless": false,
      "tokenUsage": {
        "inputTokens": 5805,
        "outputTokens": 311,
        "cacheWriteTokens": 11964,
        "cacheReadTokens": 0,
        "totalCents": 40.167,
        "discountPercentOff": 10
      },
      "chargedCents": 37.33,
      "cursorTokenFee": 1.18,
      "isFreeBugbot": false
    },
    {
      "timestamp": "1750978339901",
      "userEmail": "admin@company.com",
      "model": "claude-4-sonnet-thinking",
      "kind": "Included in Business",
      "maxMode": true,
      "requestsCosts": 1.4,
      "isTokenBasedCall": false,
      "isChargeable": false,
      "isHeadless": false,
      "chargedCents": 8,
      "isFreeBugbot": false
    }
  ],
  "period": {
    "startDate": 1748411762359,
    "endDate": 1751003762359
  }
}
```

### Set User Spend Limit

POST`/teams/user-spend-limit`Set spending limits for individual team members. This allows you to control how much each user can spend on AI usage within your team. Rate limited to 250 requests per minute per team. See [rate limits](/docs/api#rate-limits).

#### Parameters

`userEmail` string Required

Email address of the team member`spendLimitDollars` number | null Required

Spending limit in dollars (integer only, no decimals). Set to `null` to remove the limit.- **Availability**: Enterprise only
- The user must already be a member of your team
- Only integer values are accepted (no decimal amounts)
- Setting `spendLimitDollars` to 0 will set the limit to $0
- Setting `spendLimitDollars` to `null` will clear/remove the limit entirely

```
curl -X POST https://api.cursor.com/teams/user-spend-limit \
  -u YOUR_API_KEY: \
  -H "Content-Type: application/json" \
  -d '{
    "userEmail": "developer@company.com",
    "spendLimitDollars": 100
  }'
```

**Successful response:**

```
{
  "outcome": "success",
  "message": "Spend limit set to $100 for user developer@company.com"
}
```

**Error response:**

```
{
  "outcome": "error",
  "message": "Invalid email format"
}
```

### Remove Team Member

POST`/teams/remove-member`Remove a member from your team programmatically. This is useful for automating offboarding workflows or integrating with HR systems. Rate limited to 50 requests per minute per team. See [rate limits](/docs/api#rate-limits).

#### Parameters

`userId` string

Encoded user ID (e.g., `user_PDSPmvukpYgZEDXsoNirw3CFhy`). Required if `email` is not provided.`email` string

Email address of the team member. Required if `userId` is not provided.- **Availability**: Enterprise only
- Provide either `userId` or `email`, but not both
- At least one paid member must remain on the team after removal
- At least one admin (owner or free-owner) must remain on the team after removal

```
curl -X POST https://api.cursor.com/teams/remove-member \
  -u YOUR_API_KEY: \
  -H "Content-Type: application/json" \
  -d '{
    "email": "developer@company.com"
  }'
```

**Response:**

```
{
  "success": true,
  "userId": "user_PDSPmvukpYgZEDXsoNirw3CFhy",
  "hasBillingCycleUsage": true
}
```

**Remove by user ID:**

```
curl -X POST https://api.cursor.com/teams/remove-member \
  -u YOUR_API_KEY: \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_PDSPmvukpYgZEDXsoNirw3CFhy"
  }'
```

**Error responses:**

```
{
  "error": "User is not a member of this team"
}
```

```
{
  "error": "Either userId or email must be provided"
}
```

```
{
  "error": "Only one of userId or email should be provided, not both"
}
```

### Get Team Repo Blocklists

GET`/settings/repo-blocklists/repos`Retrieve all repository blocklists configured for your team. Add repositories and use patterns to prevent files or directories from being indexed or used as context.

#### Pattern Examples

Common blocklist patterns:

- `*` - Block entire repository
- `*.env` - Block all .env files
- `config/*` - Block all files in config directory
- `**/*.secret` - Block all .secret files in any subdirectory
- `src/api/keys.ts` - Block specific file

```
curl -X GET https://api.cursor.com/settings/repo-blocklists/repos \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "repos": [
    {
      "id": "repo_123",
      "url": "https://github.com/company/sensitive-repo",
      "patterns": ["*.env", "config/*", "secrets/**"]
    },
    {
      "id": "repo_456",
      "url": "https://github.com/company/internal-tools",
      "patterns": ["*"]
    }
  ]
}
```

### Upsert Repo Blocklists

POST`/settings/repo-blocklists/repos/upsert`Replace existing repository blocklists for the provided repos. This endpoint will only overwrite the patterns for the repositories provided. All other repos will be unaffected.

#### Parameters

`repos` array Required

Array of repository blocklist objects. Each repository object must contain:

- `url` string - Repository URL to blocklist
- `patterns` string[] - Array of file patterns to block (glob patterns supported)

```
curl -X POST https://api.cursor.com/settings/repo-blocklists/repos/upsert \
  -u YOUR_API_KEY: \
  -H "Content-Type: application/json" \
  -d '{
    "repos": [
      {
        "url": "https://github.com/company/sensitive-repo",
        "patterns": ["*.env", "config/*", "secrets/**"]
      },
      {
        "url": "https://github.com/company/internal-tools",
        "patterns": ["*"]
      }
    ]
  }'
```

**Response:**

```
{
  "repos": [
    {
      "id": "repo_123",
      "url": "https://github.com/company/sensitive-repo",
      "patterns": ["*.env", "config/*", "secrets/**"]
    },
    {
      "id": "repo_456",
      "url": "https://github.com/company/internal-tools",
      "patterns": ["*"]
    }
  ]
}
```

### Delete Repo Blocklist

DELETE`/settings/repo-blocklists/repos/:repoId`Remove a specific repository from the blocklist. Returns 204 No Content on successful deletion.

#### Parameters

`repoId` string Required

ID of the repository blocklist to delete```
curl -X DELETE https://api.cursor.com/settings/repo-blocklists/repos/repo_123 \
  -u YOUR_API_KEY:
```

**Response:**

```
204 No Content
```

## Billing Groups

[Billing groups](/docs/account/enterprise/billing-groups) allow Enterprise admins to understand and manage spend across groups of users. This functionality is useful for reporting, internal chargebacks, and budgeting.

Members can only be in one billing group at a time. Members not assigned to any group are placed in a reserved `Unassigned` group.

### List Groups

GET`/teams/groups`Retrieve all billing groups for your team with spend data for the current billing cycle.

#### Parameters

`billingCycle` string

ISO date string (e.g., `2025-01-15`) to specify which billing cycle to query. Defaults to current cycle.```
curl -X GET "https://api.cursor.com/teams/groups?billingCycle=2025-01-15" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "groups": [
    {
      "id": "group_PDSPmvukpYgZEDXsoNirw3CFhy",
      "name": "Engineering",
      "type": "BILLING",
      "directoryGroupId": null,
      "memberCount": 12,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-20T14:22:00.000Z",
      "spendCents": 245000,
      "currentMembers": [
        {
          "userId": "user_abc123",
          "name": "Alex Developer",
          "email": "alex@company.com",
          "joinedAt": "2024-01-15T10:30:00.000Z",
          "leftAt": null,
          "spendCents": 12500
        }
      ],
      "formerMembers": [],
      "dailySpend": [
        { "date": "2025-01-15", "spendCents": 8500 },
        { "date": "2025-01-16", "spendCents": 9200 }
      ]
    },
    {
      "id": "group_kljUvI0ASZORvSEXf9hV0ydcso",
      "name": "Design",
      "type": "BILLING",
      "directoryGroupId": "dir_group_abc123xyz",
      "memberCount": 5,
      "createdAt": "2024-01-16T09:00:00.000Z",
      "updatedAt": "2024-01-16T09:00:00.000Z",
      "spendCents": 87500,
      "currentMembers": [],
      "formerMembers": [],
      "dailySpend": []
    }
  ],
  "unassignedGroup": {
    "id": "group_unassigned",
    "name": "Unassigned",
    "type": "BILLING",
    "directoryGroupId": null,
    "memberCount": 3,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "spendCents": 15000,
    "currentMembers": [],
    "formerMembers": [],
    "dailySpend": []
  },
  "billingCycle": {
    "cycleStart": "2025-01-01T00:00:00.000Z",
    "cycleEnd": "2025-02-01T00:00:00.000Z"
  }
}
```

### Get Group

GET`/teams/groups/:groupId`Retrieve a single billing group with its members and spend data for the current billing cycle.

#### Parameters

`groupId` string Required

The encoded group ID (e.g., `group_PDSPmvukpYgZEDXsoNirw3CFhy`)`billingCycle` string

ISO date string (e.g., `2025-01-15`) to specify which billing cycle to query. Defaults to current cycle.```
curl -X GET "https://api.cursor.com/teams/groups/group_PDSPmvukpYgZEDXsoNirw3CFhy?billingCycle=2025-01-15" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "group": {
    "id": "group_PDSPmvukpYgZEDXsoNirw3CFhy",
    "name": "Engineering",
    "type": "BILLING",
    "directoryGroupId": null,
    "memberCount": 3,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-20T14:22:00.000Z",
    "spendCents": 125000,
    "currentMembers": [
      {
        "userId": "user_abc123",
        "name": "Alex Developer",
        "email": "alex@company.com",
        "joinedAt": "2024-01-15T10:30:00.000Z",
        "leftAt": null,
        "spendCents": 75000,
        "dailySpend": [
          { "date": "2025-01-15", "spendCents": 5000 },
          { "date": "2025-01-16", "spendCents": 7500 }
        ]
      },
      {
        "userId": "user_def456",
        "name": "Sam Engineer",
        "email": "sam@company.com",
        "joinedAt": "2024-01-16T09:15:00.000Z",
        "leftAt": null,
        "spendCents": 50000,
        "dailySpend": [
          { "date": "2025-01-15", "spendCents": 3500 },
          { "date": "2025-01-16", "spendCents": 4200 }
        ]
      }
    ],
    "formerMembers": [
      {
        "userId": "user_xyz789",
        "name": "Former Member",
        "email": "former@company.com",
        "joinedAt": "2024-01-10T08:00:00.000Z",
        "leftAt": "2024-01-14T17:00:00.000Z",
        "spendCents": 0
      }
    ],
    "dailySpend": [
      { "date": "2025-01-15", "spendCents": 8500 },
      { "date": "2025-01-16", "spendCents": 11700 }
    ]
  },
  "billingCycle": {
    "cycleStart": "2025-01-01T00:00:00.000Z",
    "cycleEnd": "2025-02-01T00:00:00.000Z"
  }
}
```

### Create Group

POST`/teams/groups`Create a new billing group. Rate limited to 20 requests per minute per team.

#### Parameters

`name` string Required

Name of the group`type` string

Group type. Currently only `BILLING` is supported. Default: `BILLING````
curl -X POST https://api.cursor.com/teams/groups \
  -u YOUR_API_KEY: \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Engineering"
  }'
```

**Response:**

```
{
  "group": {
    "id": "group_PDSPmvukpYgZEDXsoNirw3CFhy",
    "name": "Engineering",
    "type": "BILLING",
    "directoryGroupId": null,
    "memberCount": 0,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z",
    "members": []
  }
}
```

### Update Group

PATCH`/teams/groups/:groupId`Update a billing group's name or directory group attachment. Rate limited to 20 requests per minute per team.

Only one field can be updated per request. To update both name and directory attachment, make separate requests.

#### Parameters

`groupId` string Required

The encoded group ID`name` string

New name for the group`directoryGroupId` string | null

Directory group ID to sync with, or `null` to detach from directory sync```
curl -X PATCH https://api.cursor.com/teams/groups/group_PDSPmvukpYgZEDXsoNirw3CFhy \
  -u YOUR_API_KEY: \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Platform Engineering"
  }'
```

**Response:**

```
{
  "group": {
    "id": "group_PDSPmvukpYgZEDXsoNirw3CFhy",
    "name": "Platform Engineering",
    "type": "BILLING",
    "directoryGroupId": null,
    "memberCount": 3,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-25T16:45:00.000Z",
    "members": [
      {
        "userId": "user_abc123",
        "name": "Alex Developer",
        "email": "alex@company.com",
        "joinedAt": "2024-01-15T10:30:00.000Z"
      }
    ]
  }
}
```

### Delete Group

DELETE`/teams/groups/:groupId`Delete a billing group. Returns 204 No Content on success. Rate limited to 20 requests per minute per team.

Deleting a billing group is a destructive operation; data cannot be recovered. All historical usage for deleted groups is reassigned retroactively to the `Unassigned` group.

#### Parameters

`groupId` string Required

The encoded group ID to delete```
curl -X DELETE https://api.cursor.com/teams/groups/group_PDSPmvukpYgZEDXsoNirw3CFhy \
  -u YOUR_API_KEY:
```

**Response:**

```
204 No Content
```

### Add Members to Group

POST`/teams/groups/:groupId/members`Add team members to a billing group. Users must already be members of your team and not currently assigned to another group. Rate limited to 20 requests per minute per team.

Billing groups synced with SCIM cannot be modified via the API. All member assignment for SCIM-synced groups must be handled via [SCIM](/docs/account/teams/scim).

#### Parameters

`groupId` string Required

The encoded group ID`userIds` string[] Required

Array of encoded user IDs to add (e.g., `["user_abc123", "user_def456"]`)```
curl -X POST https://api.cursor.com/teams/groups/group_PDSPmvukpYgZEDXsoNirw3CFhy/members \
  -u YOUR_API_KEY: \
  -H "Content-Type: application/json" \
  -d '{
    "userIds": ["user_abc123", "user_def456"]
  }'
```

**Response:**

```
{
  "group": {
    "id": "group_PDSPmvukpYgZEDXsoNirw3CFhy",
    "name": "Engineering",
    "type": "BILLING",
    "directoryGroupId": null,
    "memberCount": 2,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-25T16:50:00.000Z",
    "members": [
      {
        "userId": "user_abc123",
        "name": "Alex Developer",
        "email": "alex@company.com",
        "joinedAt": "2024-01-25T16:50:00.000Z"
      },
      {
        "userId": "user_def456",
        "name": "Sam Engineer",
        "email": "sam@company.com",
        "joinedAt": "2024-01-25T16:50:00.000Z"
      }
    ]
  }
}
```

### Remove Members from Group

DELETE`/teams/groups/:groupId/members`Remove team members from a billing group. Removed members are moved to the `Unassigned` group. Rate limited to 20 requests per minute per team.

Billing groups synced with SCIM cannot be modified via the API. All member changes for SCIM-synced groups must be handled via [SCIM](/docs/account/teams/scim).

#### Parameters

`groupId` string Required

The encoded group ID`userIds` string[] Required

Array of encoded user IDs to remove```
curl -X DELETE https://api.cursor.com/teams/groups/group_PDSPmvukpYgZEDXsoNirw3CFhy/members \
  -u YOUR_API_KEY: \
  -H "Content-Type: application/json" \
  -d '{
    "userIds": ["user_def456"]
  }'
```

**Response:**

```
{
  "group": {
    "id": "group_PDSPmvukpYgZEDXsoNirw3CFhy",
    "name": "Engineering",
    "type": "BILLING",
    "directoryGroupId": null,
    "memberCount": 1,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-25T17:00:00.000Z",
    "members": [
      {
        "userId": "user_abc123",
        "name": "Alex Developer",
        "email": "alex@company.com",
        "joinedAt": "2024-01-25T16:50:00.000Z"
      }
    ]
  }
}
```


# Analytics API

The Analytics API provides comprehensive insights into your team's Cursor usage, including AI-assisted coding metrics, active users, model usage, and more.

- The Analytics API uses [Basic Authentication](/docs/api#basic-authentication). You can generate an API key from your [team settings page](https://cursor.com/settings).
- For details on authentication, rate limits, and best practices, see the [API Overview](/docs/api).
- **Availability**: Only for enterprise teams

### Available Endpoints

### Agent Edits

GET`/analytics/team/agent-edits`Get metrics on AI-suggested code edits accepted by your team with Cursor.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`users` string

Filter data to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/team/agent-edits" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": [
    {
      "event_date": "2025-01-15",
      "total_suggested_diffs": 145,
      "total_accepted_diffs": 98,
      "total_rejected_diffs": 47,
      "total_green_lines_accepted": 820,
      "total_red_lines_accepted": 160,
      "total_green_lines_rejected": 210,
      "total_red_lines_rejected": 60,
      "total_green_lines_suggested": 1030,
      "total_red_lines_suggested": 220,
      "total_lines_suggested": 1250,
      "total_lines_accepted": 980
    },
    {
      "event_date": "2025-01-16",
      "total_suggested_diffs": 132,
      "total_accepted_diffs": 89,
      "total_rejected_diffs": 43,
      "total_green_lines_accepted": 740,
      "total_red_lines_accepted": 150,
      "total_green_lines_rejected": 185,
      "total_red_lines_rejected": 55,
      "total_green_lines_suggested": 925,
      "total_red_lines_suggested": 175,
      "total_lines_suggested": 1100,
      "total_lines_accepted": 890
    }
  ],
  "params": {
    "metric": "agent-edits",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

### Tab Usage

GET`/analytics/team/tabs`Get metrics on Tab autocomplete usage across your team.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`users` string

Filter data to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/team/tabs" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": [
    {
      "event_date": "2025-01-15",
      "total_suggestions": 5420,
      "total_accepts": 3210,
      "total_rejects": 2210,
      "total_green_lines_accepted": 4120,
      "total_red_lines_accepted": 2000,
      "total_green_lines_rejected": 1480,
      "total_red_lines_rejected": 730,
      "total_green_lines_suggested": 5600,
      "total_red_lines_suggested": 2740,
      "total_lines_suggested": 8340,
      "total_lines_accepted": 6120
    },
    {
      "event_date": "2025-01-16",
      "total_suggestions": 4980,
      "total_accepts": 3050,
      "total_rejects": 1930,
      "total_green_lines_accepted": 3890,
      "total_red_lines_accepted": 1890,
      "total_green_lines_rejected": 1350,
      "total_red_lines_rejected": 580,
      "total_green_lines_suggested": 5240,
      "total_red_lines_suggested": 2650,
      "total_lines_suggested": 7890,
      "total_lines_accepted": 5780
    }
  ],
  "params": {
    "metric": "tabs",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

### Daily Active Users (DAU)

GET`/analytics/team/dau`Get daily active user counts for your team. DAU is the number of unique users who have used Cursor in a given day.
An active user is a user who has used at least one AI feature in Cursor.

Response includes DAU breakdown metrics for the Cursor CLI, Cloud Agents, and BugBot.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`users` string

Filter data to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/team/dau?startDate=14d&endDate=today" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": [
    {
      "date": "2025-01-15",
      "dau": 42,
      "cli_dau": 5,
      "cloud_agent_dau": 37,
      "bugbot_dau": 10
    },
    {
      "date": "2025-01-16",
      "dau": 38,
      "cli_dau": 4,
      "cloud_agent_dau": 34,
      "bugbot_dau": 12
    }
  ],
  "params": {
    "metric": "dau",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

### Client Versions

GET`/analytics/team/client-versions`Get distribution of Cursor client versions used by your team (defaults to last 7 days). We report the latest version for each user per day (if a user has installed multiple versions, we report the latest).

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`users` string

Filter data to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/team/client-versions" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": [
    {
      "event_date": "2025-01-01",
      "client_version": "0.42.3",
      "user_count": 35,
      "percentage": 0.833
    },
    {
      "event_date": "2025-01-01",
      "client_version": "0.42.2",
      "user_count": 7,
      "percentage": 0.167
    }
  ],
  "params": {
    "metric": "client-versions",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

### Model Usage

GET`/analytics/team/models`Get metrics on AI model usage across your team.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`users` string

Filter data to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/team/models" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": [
    {
      "date": "2025-01-15",
      "model_breakdown": {
        "claude-sonnet-4.5": {
          "messages": 1250,
          "users": 28
        },
        "gpt-4o": {
          "messages": 450,
          "users": 15
        },
        "claude-opus-4.5": {
          "messages": 320,
          "users": 12
        }
      }
    },
    {
      "date": "2025-01-16",
      "model_breakdown": {
        "claude-sonnet-4.5": {
          "messages": 1180,
          "users": 26
        },
        "gpt-4o": {
          "messages": 420,
          "users": 14
        }
      }
    }
  ],
  "params": {
    "metric": "models",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

### Top File Extensions

GET`/analytics/team/top-file-extensions`Get the most frequently edited files across your team in Cursor. Returns the top 5 file extensions per day by suggestion volume.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`users` string

Filter data to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/team/top-file-extensions?startDate=30d&endDate=today" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": [
    {
      "event_date": "2025-01-15",
      "file_extension": "tsx",
      "total_files": 156,
      "total_accepts": 98,
      "total_rejects": 45,
      "total_lines_suggested": 3230,
      "total_lines_accepted": 2340,
      "total_lines_rejected": 890
    },
    {
      "event_date": "2025-01-15",
      "file_extension": "ts",
      "total_files": 142,
      "total_accepts": 89,
      "total_rejects": 38,
      "total_lines_suggested": 2850,
      "total_lines_accepted": 2100,
      "total_lines_rejected": 750
    }
  ],
  "params": {
    "metric": "top-files",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

### MCP Adoption

GET`/analytics/team/mcp`Get metrics on MCP (Model Context Protocol) tool adoption across your team. Returns daily adoption counts broken down by tool name and MCP server name.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`users` string

Filter data to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/team/mcp" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": [
    {
      "event_date": "2025-01-15",
      "tool_name": "read_file",
      "mcp_server_name": "filesystem",
      "usage": 245
    },
    {
      "event_date": "2025-01-15",
      "tool_name": "search_web",
      "mcp_server_name": "brave-search",
      "usage": 128
    },
    {
      "event_date": "2025-01-16",
      "tool_name": "read_file",
      "mcp_server_name": "filesystem",
      "usage": 231
    }
  ],
  "params": {
    "metric": "mcp",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

### Commands Adoption

GET`/analytics/team/commands`Get metrics on Cursor command adoption across your team. Returns daily adoption counts broken down by command name.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`users` string

Filter data to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/team/commands" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": [
    {
      "event_date": "2025-01-15",
      "command_name": "explain",
      "usage": 89
    },
    {
      "event_date": "2025-01-15",
      "command_name": "refactor",
      "usage": 45
    },
    {
      "event_date": "2025-01-16",
      "command_name": "explain",
      "usage": 92
    }
  ],
  "params": {
    "metric": "commands",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

### Plans Adoption

GET`/analytics/team/plans`Get metrics on Plan mode adoption across your team. Returns daily adoption counts broken down by AI model used for plan generation.

The API returns `default` as the model name when a user has the Auto model selection enabled. This corresponds to what users see as "Auto" in the Cursor UI.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`users` string

Filter data to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/team/plans" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": [
    {
      "event_date": "2025-01-15",
      "model": "claude-sonnet-4.5",
      "usage": 156
    },
    {
      "event_date": "2025-01-15",
      "model": "default",
      "usage": 42
    },
    {
      "event_date": "2025-01-16",
      "model": "claude-sonnet-4.5",
      "usage": 148
    }
  ],
  "params": {
    "metric": "plans",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

### Skills Adoption

GET`/analytics/team/skills`Get metrics on Skills adoption across your team. Returns daily adoption counts broken down by skill name.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`users` string

Filter data to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/team/skills" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": [
    {
      "event_date": "2025-01-15",
      "skill_name": "react-best-practices",
      "usage": 53
    },
    {
      "event_date": "2025-01-15",
      "skill_name": "usage-billing",
      "usage": 41
    },
    {
      "event_date": "2025-01-16",
      "skill_name": "react-best-practices",
      "usage": 48
    }
  ],
  "params": {
    "metric": "skills",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

### Ask Mode Adoption

GET`/analytics/team/ask-mode`Get metrics on Ask mode adoption across your team. Returns daily adoption counts broken down by AI model used for Ask mode queries.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`users` string

Filter data to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/team/ask-mode" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": [
    {
      "event_date": "2025-01-15",
      "model": "claude-sonnet-4.5",
      "usage": 203
    },
    {
      "event_date": "2025-01-15",
      "model": "gpt-4o",
      "usage": 67
    },
    {
      "event_date": "2025-01-16",
      "model": "claude-sonnet-4.5",
      "usage": 198
    }
  ],
  "params": {
    "metric": "ask-mode",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

### Conversation Insights

GET`/analytics/team/conversation-insights`Get the same aggregate Conversation Insights data you see in the dashboard. This endpoint returns aggregate insights, not raw conversation exports or raw conversation content.

Available only for enterprise teams with Conversation Insights enabled. If **Disable Conversation Insights** is turned on in team settings, this endpoint returns `401`.

`intents` and `complexity` describe whole conversations.

`categories`, `guidanceLevels`, and `workTypes` describe work across conversation segments.

#### Parameters

`startDate` string

Start date for the analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for the analytics period (default: today). See [Date Formats](#date-formats)`include` string | string[]

Required. Select which Conversation Insights slices to return. Supported values: `intents`, `complexity`, `categories`, `guidanceLevels`, and `workTypes`. You can pass `include` as a comma-separated list like `include=intents,complexity` or repeat it like `include=intents&include=workTypes`.```
curl -X GET "https://api.cursor.com/analytics/team/conversation-insights?startDate=2026-03-01&endDate=2026-03-07&include=intents,complexity,categories,guidanceLevels,workTypes" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": {
    "intents": {
      "distribution": [
        {
          "intent": "Write Code",
          "count": 18
        },
        {
          "intent": "Ask",
          "count": 7
        },
        {
          "intent": "Plan",
          "count": 3
        }
      ],
      "topValues": [
        {
          "intent": "Write Code",
          "count": 18
        },
        {
          "intent": "Ask",
          "count": 7
        }
      ],
      "timeSeries": [
        {
          "date": "2026-03-01",
          "intent": "Ask",
          "count": 2
        },
        {
          "date": "2026-03-02",
          "intent": "Write Code",
          "count": 6
        }
      ],
      "subcategories": {
        "askMode": [
          {
            "subcategory": "error_fix",
            "count": 4
          }
        ],
        "planMode": [
          {
            "subcategory": "implementation",
            "count": 3
          }
        ],
        "writeCode": [
          {
            "subcategory": "feature",
            "count": 11
          }
        ]
      }
    },
    "complexity": {
      "distribution": [
        {
          "complexity": "high",
          "count": 12
        },
        {
          "complexity": "medium",
          "count": 10
        }
      ],
      "timeSeries": [
        {
          "date": "2026-03-01",
          "complexity": "medium",
          "count": 4
        },
        {
          "date": "2026-03-02",
          "complexity": "high",
          "count": 5
        }
      ]
    },
    "categories": {
      "distribution": [
        {
          "category": "New Features",
          "count": 9
        },
        {
          "category": "Bug Fixing & Debugging",
          "count": 6
        }
      ],
      "timeSeries": [
        {
          "date": "2026-03-01",
          "category": "Bug Fixing & Debugging",
          "count": 2
        },
        {
          "date": "2026-03-02",
          "category": "New Features",
          "count": 4
        }
      ]
    },
    "guidanceLevels": {
      "distribution": [
        {
          "guidanceLevel": "high",
          "count": 8
        },
        {
          "guidanceLevel": "medium",
          "count": 7
        }
      ],
      "timeSeries": [
        {
          "date": "2026-03-01",
          "guidanceLevel": "medium",
          "count": 3
        },
        {
          "date": "2026-03-02",
          "guidanceLevel": "high",
          "count": 4
        }
      ]
    },
    "workTypes": {
      "distribution": [
        {
          "workType": "new_feature",
          "count": 9
        },
        {
          "workType": "bug",
          "count": 6
        }
      ],
      "timeSeries": [
        {
          "date": "2026-03-01",
          "workType": "bug",
          "count": 2
        },
        {
          "date": "2026-03-02",
          "workType": "new_feature",
          "count": 4
        }
      ]
    }
  },
  "params": {
    "metric": "conversation-insights",
    "teamId": 12345,
    "startDate": "2026-03-01",
    "endDate": "2026-03-07",
    "include": [
      "intents",
      "complexity",
      "categories",
      "guidanceLevels",
      "workTypes"
    ]
  }
}
```

### Leaderboard

GET`/analytics/team/leaderboard`Get a leaderboard of team members ranked by AI usage metrics.

**Behavior:**

- **Without user filtering**: Returns users ranked by the specified metric (default: combined lines accepted)
- **With user filtering**: Returns users that match the filter (with their actual team-wide rankings)
- Supports pagination for teams with many members

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`page` number

Page number for pagination (1-indexed). Default: `1``pageSize` number

Number of users per page (default: 10, max: 500)`users` string

Filter to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)Returns separate leaderboards for Tab autocomplete and Agent edits. When filtering by users, those users appear with their **actual team-wide rank**, not a filtered rank. For example, if you request a user who ranks #45 overall, they'll appear with `rank: 45`.

```
# Get first page of leaderboard (top 10 users)
curl -X GET "https://api.cursor.com/analytics/team/leaderboard" \
  -u YOUR_API_KEY:
```

```
# Get second page with custom page size
curl -X GET "https://api.cursor.com/analytics/team/leaderboard?page=2&pageSize=20" \
  -u YOUR_API_KEY:
```

```
# Filter by specific users
curl -X GET "https://api.cursor.com/analytics/team/leaderboard?users=alice@example.com,bob@example.com" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": {
    "tab_leaderboard": {
      "data": [
        {
          "email": "alice@example.com",
          "user_id": "user_abc123",
          "profile_picture_url": "https://example.com/avatars/alice.jpg",
          "total_accepts": 1334,
          "total_lines_accepted": 3455,
          "total_lines_suggested": 15307,
          "line_acceptance_ratio": 0.2256519892590384,
          "accept_ratio": 0.2330827067669173,
          "rank": 1
        },
        {
          "email": "bob@example.com",
          "user_id": "user_def789",
          "profile_picture_url": "https://example.com/avatars/bob.jpg",
          "total_accepts": 796,
          "total_lines_accepted": 2090,
          "total_lines_suggested": 7689,
          "line_acceptance_ratio": 0.2718168812589414,
          "accept_ratio": 0.2731256599787746,
          "rank": 2
        }
      ],
      "total_users": 142
    },
    "agent_leaderboard": {
      "data": [
        {
          "email": "alice@example.com",
          "user_id": "user_abc123",
          "profile_picture_url": "https://example.com/avatars/alice.jpg",
          "total_accepts": 914,
          "total_lines_accepted": 65947,
          "total_lines_suggested": 201467,
          "line_acceptance_ratio": 0.3273465219182842,
          "rank": 1
        },
        {
          "email": "bob@example.com",
          "user_id": "user_def789",
          "profile_picture_url": "https://example.com/avatars/bob.jpg",
          "total_accepts": 843,
          "total_lines_accepted": 61709,
          "total_lines_suggested": 51092,
          "line_acceptance_ratio": 1.2077924536684573,
          "rank": 2
        }
      ],
      "total_users": 142
    }
  },
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "totalUsers": 142,
    "totalPages": 15,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "params": {
    "metric": "leaderboard",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31",
    "page": 1,
    "pageSize": 10
  }
}
```

### Bugbot Analytics

GET`/analytics/team/bugbot`Get per-PR Bugbot review analytics for your team, including issue counts by severity and how many issues were resolved.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`prState` string

PR state filter. Allowed values: `merged` or `all`. Default: `merged`. Use `merged` for merged PR analytics only. Use `all` for analytics across PR states.`repo` string

Optional repository filter. Accepts full URLs or host/path formats (for example, `https://github.com/org/repo.git` or `github.com/org/repo`). Normalized to `host/owner/repo`.`page` number

Page number for pagination (1-indexed). Default: `1``pageSize` number

Number of PRs per page (default: `100`, max: `250`)```
# Get Bugbot PR analytics for last 7 days (default window)
curl -X GET "https://api.cursor.com/analytics/team/bugbot" \
  -u YOUR_API_KEY:
```

```
# Filter by repository and date range
curl -X GET "https://api.cursor.com/analytics/team/bugbot?repo=github.com/acme/app&startDate=2025-01-01&endDate=2025-01-31" \
  -u YOUR_API_KEY:
```

```
# Paginate results
curl -X GET "https://api.cursor.com/analytics/team/bugbot?page=2&pageSize=50" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": [
    {
      "repo": "github.com/acme/app",
      "pr_number": 42,
      "timestamp": "2025-01-21T00:00:00.000Z",
      "reviews": 3,
      "issues": {
        "total": 5,
        "by_severity": {
          "high": 1,
          "medium": 2,
          "low": 2
        }
      },
      "issues_resolved": {
        "total": 2,
        "by_severity": {
          "high": 1,
          "medium": 1,
          "low": 0
        }
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 100,
    "totalItems": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "params": {
    "metric": "bugbot",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31",
    "repo": "github.com/acme/app",
    "prState": "merged",
    "page": 1,
    "pageSize": 100
  }
}
```

---

## By-User Endpoints

By-user endpoints provide the same metrics as team-level endpoints, but organized by individual users with pagination support. These are ideal for generating per-user reports or processing large teams in batches.

### Common Query Parameters

ParameterTypeRequiredDescription`startDate`Date stringNoStart date for the analytics period (default: 7 days ago)`endDate`Date stringNoEnd date for the analytics period (default: today)`page`numberNoPage number (default: 1)`pageSize`numberNoNumber of users per page (default: 100, max: 500)`users`stringNoLimit pagination to specific users (comma-separated emails or IDs, e.g., `alice@example.com,user_abc123`)
**User Filtering:**
When you provide the `users` parameter to by-user endpoints:

- **Pagination is filtered**: Only the specified users are included in the result set and pagination counts
- **Useful for**: Getting detailed data for specific team members without paginating through all users
- Example: If you have 500 users but only want data for 3 specific users, filter by their emails to get all 3 in a single page

**Note:** By-user endpoints support the same date formats and shortcuts as team-level endpoints. See the [Date Formats](#date-formats) section above.

### Response Format

All by-user endpoints return data in this format:

```
{
  "data": {
    "user1@example.com": [ /* user's data */ ],
    "user2@example.com": [ /* user's data */ ]
  },
  "pagination": {
    "page": 1,
    "pageSize": 100,
    "totalUsers": 250,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "params": {
    "metric": "agent-edits",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31",
    "page": 1,
    "pageSize": 100,
    "userMappings": [
      { "id": "user_abc123", "email": "user1@example.com" },
      { "id": "user_def456", "email": "user2@example.com" }
    ]
  }
}
```

**Response Structure:**

- `data` - Object keyed by user email addresses, each containing an array of that user's metrics
- `pagination` - Pagination information
- `params` - Request parameters echoed back
- `userMappings` - Array mapping email addresses to public user IDs for this page. Useful for cross-referencing with other APIs or creating links to user profiles.

### Available Endpoints

All by-user endpoints follow the pattern: `/analytics/by-user/{metric}`

- `GET /analytics/by-user/agent-edits` - Agent edits by user
- `GET /analytics/by-user/tabs` - Tab usage by user
- `GET /analytics/by-user/models` - Model usage by user
- `GET /analytics/by-user/top-file-extensions` - Top files by user
- `GET /analytics/by-user/client-versions` - Client versions by user
- `GET /analytics/by-user/mcp` - MCP adoption by user
- `GET /analytics/by-user/commands` - Commands adoption by user
- `GET /analytics/by-user/plans` - Plans adoption by user
- `GET /analytics/by-user/skills` - Skills adoption by user
- `GET /analytics/by-user/ask-mode` - Ask mode adoption by user

### Agent Edits By User

GET`/analytics/by-user/agent-edits`Get agent edits metrics organized by individual users with pagination support.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`page` number

Page number (1-indexed). Default: `1``pageSize` number

Number of users per page (default: 100, max: 500)`users` string

Limit pagination to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/by-user/agent-edits?page=1&pageSize=50" \
  -u YOUR_API_KEY:
```

```
curl -X GET "https://api.cursor.com/analytics/by-user/agent-edits?users=alice@example.com,bob@example.com,carol@example.com" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": {
    "alice@example.com": [
      {
        "event_date": "2025-01-15",
        "total_suggested_diffs": 145,
        "total_accepted_diffs": 98,
        "total_rejected_diffs": 47,
        "total_green_lines_accepted": 820,
        "total_red_lines_accepted": 160,
        "total_green_lines_rejected": 210,
        "total_red_lines_rejected": 60,
        "total_green_lines_suggested": 1030,
        "total_red_lines_suggested": 220,
        "total_lines_suggested": 1250,
        "total_lines_accepted": 980
      },
      {
        "event_date": "2025-01-16",
        "total_suggested_diffs": 132,
        "total_accepted_diffs": 89,
        "total_rejected_diffs": 43,
        "total_green_lines_accepted": 740,
        "total_red_lines_accepted": 150,
        "total_green_lines_rejected": 185,
        "total_red_lines_rejected": 55,
        "total_green_lines_suggested": 925,
        "total_red_lines_suggested": 175,
        "total_lines_suggested": 1100,
        "total_lines_accepted": 890
      }
    ],
    "bob@example.com": [
      {
        "event_date": "2025-01-15",
        "total_suggested_diffs": 95,
        "total_accepted_diffs": 72,
        "total_rejected_diffs": 23,
        "total_green_lines_accepted": 450,
        "total_red_lines_accepted": 90,
        "total_green_lines_rejected": 120,
        "total_red_lines_rejected": 35,
        "total_green_lines_suggested": 570,
        "total_red_lines_suggested": 125,
        "total_lines_suggested": 695,
        "total_lines_accepted": 540
      }
    ]
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalUsers": 120,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "params": {
    "metric": "agent-edits",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31",
    "page": 1,
    "pageSize": 50,
    "userMappings": [
      { "id": "user_abc123", "email": "alice@example.com" },
      { "id": "user_def456", "email": "bob@example.com" }
    ]
  }
}
```

### Tab Usage By User

GET`/analytics/by-user/tabs`Get Tab autocomplete metrics organized by individual users with pagination support.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`page` number

Page number (1-indexed). Default: `1``pageSize` number

Number of users per page (default: 100, max: 500)`users` string

Limit pagination to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/by-user/tabs?page=1&pageSize=50" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": {
    "alice@example.com": [
      {
        "event_date": "2025-01-15",
        "total_suggestions": 320,
        "total_accepts": 210,
        "total_rejects": 110,
        "total_green_lines_accepted": 280,
        "total_red_lines_accepted": 120,
        "total_green_lines_rejected": 90,
        "total_red_lines_rejected": 45,
        "total_green_lines_suggested": 370,
        "total_red_lines_suggested": 165,
        "total_lines_suggested": 535,
        "total_lines_accepted": 400
      }
    ],
    "bob@example.com": [
      {
        "event_date": "2025-01-15",
        "total_suggestions": 180,
        "total_accepts": 120,
        "total_rejects": 60,
        "total_green_lines_accepted": 150,
        "total_red_lines_accepted": 70,
        "total_green_lines_rejected": 50,
        "total_red_lines_rejected": 25,
        "total_green_lines_suggested": 200,
        "total_red_lines_suggested": 95,
        "total_lines_suggested": 295,
        "total_lines_accepted": 220
      }
    ]
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalUsers": 120,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "params": {
    "metric": "tabs",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31",
    "page": 1,
    "pageSize": 50,
    "userMappings": [
      { "id": "user_abc123", "email": "alice@example.com" },
      { "id": "user_def456", "email": "bob@example.com" }
    ]
  }
}
```

### Model Usage By User

GET`/analytics/by-user/models`Get model usage metrics organized by individual users with pagination support.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`page` number

Page number (1-indexed). Default: `1``pageSize` number

Number of users per page (default: 100, max: 500)`users` string

Limit pagination to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/by-user/models?page=1&pageSize=50" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": {
    "alice@example.com": [
      {
        "date": "2025-01-15",
        "model_breakdown": {
          "claude-sonnet-4.5": {
            "messages": 85,
            "users": 1
          },
          "gpt-4o": {
            "messages": 32,
            "users": 1
          }
        }
      }
    ],
    "bob@example.com": [
      {
        "date": "2025-01-15",
        "model_breakdown": {
          "claude-sonnet-4.5": {
            "messages": 64,
            "users": 1
          }
        }
      }
    ]
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalUsers": 120,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "params": {
    "metric": "models",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31",
    "page": 1,
    "pageSize": 50,
    "userMappings": [
      { "id": "user_abc123", "email": "alice@example.com" },
      { "id": "user_def456", "email": "bob@example.com" }
    ]
  }
}
```

### Top File Extensions By User

GET`/analytics/by-user/top-file-extensions`Get top file extension metrics organized by individual users with pagination support.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`page` number

Page number (1-indexed). Default: `1``pageSize` number

Number of users per page (default: 100, max: 500)`users` string

Limit pagination to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/by-user/top-file-extensions?page=1&pageSize=50" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": {
    "alice@example.com": [
      {
        "event_date": "2025-01-15",
        "file_extension": "tsx",
        "total_files": 45,
        "total_accepts": 32,
        "total_rejects": 10,
        "total_lines_suggested": 890,
        "total_lines_accepted": 650,
        "total_lines_rejected": 240
      },
      {
        "event_date": "2025-01-15",
        "file_extension": "ts",
        "total_files": 38,
        "total_accepts": 28,
        "total_rejects": 8,
        "total_lines_suggested": 720,
        "total_lines_accepted": 540,
        "total_lines_rejected": 180
      }
    ],
    "bob@example.com": [
      {
        "event_date": "2025-01-15",
        "file_extension": "py",
        "total_files": 22,
        "total_accepts": 18,
        "total_rejects": 4,
        "total_lines_suggested": 410,
        "total_lines_accepted": 340,
        "total_lines_rejected": 70
      }
    ]
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalUsers": 120,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "params": {
    "metric": "top-files",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31",
    "page": 1,
    "pageSize": 50,
    "userMappings": [
      { "id": "user_abc123", "email": "alice@example.com" },
      { "id": "user_def456", "email": "bob@example.com" }
    ]
  }
}
```

### Client Versions By User

GET`/analytics/by-user/client-versions`Get client version metrics organized by individual users with pagination support.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`page` number

Page number (1-indexed). Default: `1``pageSize` number

Number of users per page (default: 100, max: 500)`users` string

Limit pagination to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/by-user/client-versions?page=1&pageSize=50" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": {
    "alice@example.com": [
      {
        "event_date": "2025-01-15",
        "client_version": "0.42.3",
        "user_count": 1,
        "percentage": 1.0
      }
    ],
    "bob@example.com": [
      {
        "event_date": "2025-01-15",
        "client_version": "0.42.2",
        "user_count": 1,
        "percentage": 1.0
      }
    ]
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalUsers": 120,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "params": {
    "metric": "client-versions",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31",
    "page": 1,
    "pageSize": 50,
    "userMappings": [
      { "id": "user_abc123", "email": "alice@example.com" },
      { "id": "user_def456", "email": "bob@example.com" }
    ]
  }
}
```

### MCP Adoption By User

GET`/analytics/by-user/mcp`Get MCP tool adoption metrics organized by individual users with pagination support.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`page` number

Page number (1-indexed). Default: `1``pageSize` number

Number of users per page (default: 100, max: 500)`users` string

Limit pagination to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/by-user/mcp?page=1&pageSize=50" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": {
    "alice@example.com": [
      {
        "event_date": "2025-01-15",
        "tool_name": "read_file",
        "mcp_server_name": "filesystem",
        "usage": 45
      },
      {
        "event_date": "2025-01-16",
        "tool_name": "read_file",
        "mcp_server_name": "filesystem",
        "usage": 38
      }
    ],
    "bob@example.com": [
      {
        "event_date": "2025-01-15",
        "tool_name": "search_web",
        "mcp_server_name": "brave-search",
        "usage": 23
      }
    ]
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalUsers": 120,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "params": {
    "metric": "mcp",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31",
    "page": 1,
    "pageSize": 50,
    "userMappings": [
      { "id": "user_abc123", "email": "alice@example.com" },
      { "id": "user_def456", "email": "bob@example.com" }
    ]
  }
}
```

### Commands Adoption By User

GET`/analytics/by-user/commands`Get command adoption metrics organized by individual users with pagination support.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`page` number

Page number (1-indexed). Default: `1``pageSize` number

Number of users per page (default: 100, max: 500)`users` string

Limit pagination to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/by-user/commands?page=1&pageSize=50" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": {
    "alice@example.com": [
      {
        "event_date": "2025-01-15",
        "command_name": "explain",
        "usage": 12
      },
      {
        "event_date": "2025-01-16",
        "command_name": "explain",
        "usage": 15
      }
    ],
    "bob@example.com": [
      {
        "event_date": "2025-01-15",
        "command_name": "refactor",
        "usage": 8
      }
    ]
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalUsers": 120,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "params": {
    "metric": "commands",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31",
    "page": 1,
    "pageSize": 50,
    "userMappings": [
      { "id": "user_abc123", "email": "alice@example.com" },
      { "id": "user_def456", "email": "bob@example.com" }
    ]
  }
}
```

### Plans Adoption By User

GET`/analytics/by-user/plans`Get Plan mode adoption metrics organized by individual users with pagination support.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`page` number

Page number (1-indexed). Default: `1``pageSize` number

Number of users per page (default: 100, max: 500)`users` string

Limit pagination to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/by-user/plans?page=1&pageSize=50" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": {
    "alice@example.com": [
      {
        "event_date": "2025-01-15",
        "model": "claude-sonnet-4.5",
        "usage": 23
      },
      {
        "event_date": "2025-01-16",
        "model": "claude-sonnet-4.5",
        "usage": 19
      }
    ],
    "bob@example.com": [
      {
        "event_date": "2025-01-15",
        "model": "gpt-4o",
        "usage": 12
      }
    ]
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalUsers": 120,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "params": {
    "metric": "plans",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31",
    "page": 1,
    "pageSize": 50,
    "userMappings": [
      { "id": "user_abc123", "email": "alice@example.com" },
      { "id": "user_def456", "email": "bob@example.com" }
    ]
  }
}
```

### Skills Adoption By User

GET`/analytics/by-user/skills`Get Skills adoption metrics organized by individual users with pagination support.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`page` number

Page number (1-indexed). Default: `1``pageSize` number

Number of users per page (default: 100, max: 500)`users` string

Limit pagination to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/by-user/skills?page=1&pageSize=50" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": {
    "alice@example.com": [
      {
        "event_date": "2025-01-15",
        "skill_name": "react-best-practices",
        "usage": 8
      },
      {
        "event_date": "2025-01-15",
        "skill_name": "create-rule",
        "usage": 3
      },
      {
        "event_date": "2025-01-16",
        "skill_name": "react-best-practices",
        "usage": 5
      }
    ],
    "bob@example.com": [
      {
        "event_date": "2025-01-15",
        "skill_name": "commit-message-helper",
        "usage": 5
      },
      {
        "event_date": "2025-01-15",
        "skill_name": "create-skill",
        "usage": 2
      }
    ]
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalUsers": 120,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "params": {
    "metric": "skills",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31",
    "page": 1,
    "pageSize": 50,
    "userMappings": [
      { "id": "user_abc123", "email": "alice@example.com" },
      { "id": "user_def456", "email": "bob@example.com" }
    ]
  }
}
```

### Ask Mode Adoption By User

GET`/analytics/by-user/ask-mode`Get Ask mode adoption metrics organized by individual users with pagination support.

#### Parameters

`startDate` string

Start date for analytics period (default: 7 days ago). See [Date Formats](#date-formats)`endDate` string

End date for analytics period (default: today). See [Date Formats](#date-formats)`page` number

Page number (1-indexed). Default: `1``pageSize` number

Number of users per page (default: 100, max: 500)`users` string

Limit pagination to specific users (comma-separated emails or user IDs, e.g., `alice@example.com,user_abc123`)```
curl -X GET "https://api.cursor.com/analytics/by-user/ask-mode?page=1&pageSize=50" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "data": {
    "alice@example.com": [
      {
        "event_date": "2025-01-15",
        "model": "claude-sonnet-4.5",
        "usage": 34
      },
      {
        "event_date": "2025-01-16",
        "model": "claude-sonnet-4.5",
        "usage": 28
      }
    ],
    "bob@example.com": [
      {
        "event_date": "2025-01-15",
        "model": "gpt-4o",
        "usage": 15
      }
    ]
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalUsers": 120,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "params": {
    "metric": "ask-mode",
    "teamId": 12345,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31",
    "page": 1,
    "pageSize": 50,
    "userMappings": [
      { "id": "user_abc123", "email": "alice@example.com" },
      { "id": "user_def456", "email": "bob@example.com" }
    ]
  }
}
```

---

## Team-Level Endpoints

Team-level endpoints provide aggregated metrics for your entire team or filtered subsets of users. All endpoints support date range filtering and optional user filtering.

### Common Query Parameters

ParameterTypeRequiredDescription`startDate`Date stringNoStart date for the analytics period (default: 7 days ago)`endDate`Date stringNoEnd date for the analytics period (default: today)`users`stringNoFilter data to specific users (comma-separated). Each value can be an email (e.g., `alice@example.com`) or public user ID (e.g., `user_abc123`). You can mix both formats.
**User Filtering:**
The `users` parameter accepts a comma-separated list of identifiers. Each identifier can be:

- **Email address** (e.g., `alice@example.com`) - Auto-detected by the presence of `@`
- **Public user ID** (e.g., `user_abc123`) - Auto-detected by the `user_` prefix
- **Mixed format** - You can combine emails and IDs in the same request

**Examples:**

```
# Filter by emails only
?users=alice@example.com,bob@example.com,carol@example.com

# Filter by public user IDs only
?users=user_abc123,user_def456,user_ghi789

# Mix emails and IDs
?users=alice@example.com,user_def456,bob@example.com
```

When you filter by users, the API returns data **only for those specific users**. This is useful for:

- Analyzing specific team members or groups (e.g., engineering leads, specific project teams)
- Generating reports for a subset of users
- Comparing metrics across selected individuals

### Date Formats

**Default Behavior:**
If you omit both `startDate` and `endDate`, the API defaults to the **last 7 days** (from 7 days ago until today). This is perfect for quick queries without specifying dates.

**Standard Formats:**

- `YYYY-MM-DD` - Simple date format (e.g., `2025-01-15`) **← Recommended**
- ISO 8601 timestamps (e.g., `2025-01-15T00:00:00Z`)

**Shortcuts:**

- `now` or `today` - Current date (at 00:00:00)
- `yesterday` - Yesterday's date (at 00:00:00)
- `<number>d` - Days ago (e.g., `7d` = 7 days ago, `30d` = 30 days ago)

**Important Notes:**

- **Time is ignored**: All dates are resolved to the day level (00:00:00 UTC). Sending `2025-01-15T14:30:00Z` is the same as `2025-01-15`.
- **Use recommended formats**: Use `YYYY-MM-DD` or shortcuts for better HTTP caching support. Different time values (like `T14:30:00Z` vs `T08:00:00Z`) prevent cache hits even though they resolve to the same day.
- **Date ranges**: Limited to a maximum of 30 days.

**Examples:**

```
# Omit dates for last 7 days (simplest and best for caching)
curl "https://api.cursor.com/analytics/team/agent-edits"

# Using YYYY-MM-DD format for specific date range (recommended)
?startDate=2025-01-01&endDate=2025-01-31

# Using shortcuts for last 30 days
?startDate=30d&endDate=today

# Using shortcuts for last 14 days
?startDate=14d&endDate=now

# ❌ Don't use timestamps - prevents caching and time is ignored anyway
?startDate=2025-01-15T14:30:00Z&endDate=2025-01-31T23:59:59Z
```

## Rate Limits

Rate limits are enforced per team and reset every minute:

- **Team-level endpoints**: 100 requests per minute per team
- **By-user endpoints**: 50 requests per minute per team

**What happens when you exceed the rate limit?**

When you exceed the rate limit, you'll receive a `429 Too Many Requests` response:

```
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

## Best Practices

For general API best practices including exponential backoff, caching strategies, and error handling, see the [API Overview Best Practices](/docs/api#best-practices).

1. **Use pagination for large teams**: If your team has more than 100 users, use the by-user endpoints with pagination to avoid timeouts.
2. **Leverage caching**: Both Team and User level endpoints support ETags. Store the ETag and use `If-None-Match` headers to reduce unnecessary data transfer.
3. **Filter by users when possible**: If you only need data for specific users, use the `users` parameter to reduce query time.
4. **Date ranges**: Keep date ranges reasonable (e.g., 1-3 months) for optimal performance.

# AI Code Tracking API

The AI Code Tracking API lets you track AI-generated code contributions across your team's repositories, including per-commit AI usage and granular accepted AI changes.

- The AI Code Tracking API uses [Basic Authentication](/docs/api#basic-authentication) with your API key as the username, the same method as the Admin API.
- For details on creating API keys, authentication methods, rate limits, and best practices, see the [API Overview](/docs/api).
- **Availability**: Enterprise only, [contact sales](https://cursor.com/contact-sales?source=docs-ai-code-tracking) to get access
- **Status**: Alpha (response shapes and fields may change)
- **Workspace limitation**: Metrics are only calculated for the git repository at the top level of the workspace root. Multi-root workspaces are not currently supported.

## Endpoints

### Get AI Commit Metrics (JSON, paginated)

GET`/analytics/ai-code/commits`Retrieve aggregated per-commit metrics that attribute lines to TAB, COMPOSER, and non-AI.

#### Parameters

`startDate` string | date

ISO date string, the literal "now", or relative days like "7d" (means now - 7 days). Default: now - 7 days`endDate` string | date

ISO date string, the literal "now", or relative days like "0d". Default: now`page` number

Page number (1-based). Default: 1`pageSize` number

Results per page. Default: 100, Max: 1000`user` string

Optional filter by a single user. Accepts email (e.g., [developer@company.com](mailto:developer@company.com)), encoded ID (e.g., user_abc123...), or numeric ID (e.g., 42)
#### Response Fields

FieldTypeDescription`commitHash`stringGit commit hash`userId`stringEncoded user ID (e.g., user_abc123)`userEmail`stringUser's email address`repoName`string | nullRepository name`branchName`string | nullBranch name`isPrimaryBranch`boolean | nullWhether this is the primary branch`commitSource`"ide" | "cli" | "cloud"Where the commit originated.`totalLinesAdded`numberTotal lines added in commit`totalLinesDeleted`numberTotal lines deleted in commit`tabLinesAdded`numberLines added via TAB completions`tabLinesDeleted`numberLines deleted via TAB completions`composerLinesAdded`numberLines added via Composer`composerLinesDeleted`numberLines deleted via Composer`nonAiLinesAdded`number | nullNon-AI lines added`nonAiLinesDeleted`number | nullNon-AI lines deleted`message`string | nullCommit message`commitTs`string | nullCommit timestamp (ISO format)`createdAt`stringIngestion timestamp (ISO format)```
curl -X GET "https://api.cursor.com/analytics/ai-code/commits?startDate=7d&endDate=now&page=1&pageSize=100" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "items": [
    {
      "commitHash": "a1b2c3d4",
      "userId": "user_3k9x8q...",
      "userEmail": "developer@company.com",
      "repoName": "company/repo",
      "branchName": "main",
      "isPrimaryBranch": true,
      "commitSource": "ide",
      "totalLinesAdded": 120,
      "totalLinesDeleted": 30,
      "tabLinesAdded": 50,
      "tabLinesDeleted": 10,
      "composerLinesAdded": 40,
      "composerLinesDeleted": 5,
      "nonAiLinesAdded": 30,
      "nonAiLinesDeleted": 15,
      "message": "Refactor: extract analytics client",
      "commitTs": "2025-07-30T14:12:03.000Z",
      "createdAt": "2025-07-30T14:12:30.000Z"
    }
  ],
  "totalCount": 42,
  "page": 1,
  "pageSize": 100
}
```

### Download AI Commit Metrics (CSV, streaming)

GET`/analytics/ai-code/commits.csv`Download commit metrics data in CSV format for large data extractions.

#### Parameters

`startDate` string | date

ISO date string, the literal "now", or relative days like "7d" (means now - 7 days). Default: now - 7 days`endDate` string | date

ISO date string, the literal "now", or relative days like "0d". Default: now`user` string

Optional filter by a single user. Accepts email (e.g., [developer@company.com](mailto:developer@company.com)), encoded ID (e.g., user_abc123...), or numeric ID (e.g., 42)#### Response Headers

- Content-Type: text/csv; charset=utf-8

#### CSV Columns

ColumnTypeDescription`commit_hash`stringGit commit hash`user_id`stringEncoded user ID`user_email`stringUser's email address`repo_name`stringRepository name`branch_name`stringBranch name`is_primary_branch`booleanWhether this is the primary branch`commit_source`stringWhere the commit originated (`ide`, `cli`, or `cloud`)`total_lines_added`numberTotal lines added in commit`total_lines_deleted`numberTotal lines deleted in commit`tab_lines_added`numberLines added via TAB completions`tab_lines_deleted`numberLines deleted via TAB completions`composer_lines_added`numberLines added via Composer`composer_lines_deleted`numberLines deleted via Composer`non_ai_lines_added`numberNon-AI lines added`non_ai_lines_deleted`numberNon-AI lines deleted`message`stringCommit message`commit_ts`stringCommit timestamp (ISO format)`created_at`stringIngestion timestamp (ISO format)```
curl -L "https://api.cursor.com/analytics/ai-code/commits.csv?startDate=2025-07-01T00:00:00Z&endDate=now&user=user_3k9x8q..." \
  -u YOUR_API_KEY: \
  -o commits.csv
```

**Sample CSV Output:**

```
commit_hash,commit_source,user_id,user_email,repo_name,branch_name,is_primary_branch,total_lines_added,total_lines_deleted,tab_lines_added,tab_lines_deleted,composer_lines_added,composer_lines_deleted,non_ai_lines_added,non_ai_lines_deleted,message,commit_ts,created_at
a1b2c3d4,ide,user_3k9x8q...,developer@company.com,company/repo,main,true,120,30,50,10,40,5,30,15,"Refactor: extract analytics client",2025-07-30T14:12:03.000Z,2025-07-30T14:12:30.000Z
e5f6g7h8,cloud,user_3k9x8q...,developer@company.com,company/repo,feature-branch,false,85,15,30,5,25,3,30,7,"Add error handling",2025-07-30T13:45:21.000Z,2025-07-30T13:45:45.000Z
```

### Get AI Code Change Metrics (JSON, paginated)

GET`/analytics/ai-code/changes`Retrieve granular accepted AI changes, grouped by deterministic changeId. Useful to analyze accepted AI events independent of commits.

#### Parameters

`startDate` string | date

ISO date string, the literal "now", or relative days like "7d" (means now - 7 days). Default: now - 7 days`endDate` string | date

ISO date string, the literal "now", or relative days like "0d". Default: now`page` number

Page number (1-based). Default: 1`pageSize` number

Results per page. Default: 100, Max: 1000`user` string

Optional filter by a single user. Accepts email (e.g., [developer@company.com](mailto:developer@company.com)), encoded ID (e.g., user_abc123...), or numeric ID (e.g., 42)
#### Response Fields

FieldTypeDescription`changeId`stringDeterministic ID for the change`userId`stringEncoded user ID (e.g., user_abc123)`userEmail`stringUser's email address`source`"TAB" | "COMPOSER"Source of the AI change`model`string | nullAI model used`totalLinesAdded`numberTotal lines added`totalLinesDeleted`numberTotal lines deleted`createdAt`stringIngestion timestamp (ISO format)`metadata`ArrayFile metadata (fileName may be omitted in privacy mode)```
curl -X GET "https://api.cursor.com/analytics/ai-code/changes?startDate=14d&endDate=now&page=1&pageSize=200" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "items": [
    {
      "changeId": "749356201",
      "userId": "user_3k9x8q...",
      "userEmail": "developer@company.com",
      "source": "COMPOSER",
      "model": null,
      "totalLinesAdded": 18,
      "totalLinesDeleted": 4,
      "createdAt": "2025-07-30T15:10:12.000Z",
      "metadata": [
        {
          "fileName": "src/analytics/report.ts",
          "fileExtension": "ts",
          "linesAdded": 12,
          "linesDeleted": 3
        },
        {
          "fileName": "src/analytics/ui.tsx",
          "fileExtension": "tsx",
          "linesAdded": 6,
          "linesDeleted": 1
        }
      ]
    }
  ],
  "totalCount": 128,
  "page": 1,
  "pageSize": 200
}
```

### Download AI Code Change Metrics (CSV, streaming)

GET`/analytics/ai-code/changes.csv`Download change metrics data in CSV format for large data extractions.

#### Parameters

`startDate` string | date

ISO date string, the literal "now", or relative days like "7d" (means now - 7 days). Default: now - 7 days`endDate` string | date

ISO date string, the literal "now", or relative days like "0d". Default: now`user` string

Optional filter by a single user. Accepts email (e.g., [developer@company.com](mailto:developer@company.com)), encoded ID (e.g., user_abc123...), or numeric ID (e.g., 42)#### Response Headers

- Content-Type: text/csv; charset=utf-8

#### CSV Columns

ColumnTypeDescription`change_id`stringDeterministic ID for the change`user_id`stringEncoded user ID`user_email`stringUser's email address`source`stringSource of the AI change (TAB or COMPOSER)`model`stringAI model used`total_lines_added`numberTotal lines added`total_lines_deleted`numberTotal lines deleted`created_at`stringIngestion timestamp (ISO format)`metadata_json`stringJSON stringified array of metadata entries```
curl -L "https://api.cursor.com/analytics/ai-code/changes.csv?startDate=30d&endDate=now" \
  -u YOUR_API_KEY: \
  -o changes.csv
```

**Sample CSV Output:**

```
change_id,user_id,user_email,source,model,total_lines_added,total_lines_deleted,created_at,metadata_json
749356201,user_3k9x8q...,developer@company.com,COMPOSER,gpt-4o,18,4,2025-07-30T15:10:12.000Z,"[{""fileName"":""src/analytics/report.ts"",""fileExtension"":""ts"",""linesAdded"":12,""linesDeleted"":3},{""fileName"":""src/analytics/ui.tsx"",""fileExtension"":""tsx"",""linesAdded"":6,""linesDeleted"":1}]"
749356202,user_3k9x8q...,developer@company.com,TAB,,8,2,2025-07-30T15:08:45.000Z,"[{""fileName"":""src/utils/helpers.ts"",""fileExtension"":""ts"",""linesAdded"":8,""linesDeleted"":2}]"
```

### Get Commit Details

GET`/analytics/ai-code/commits/:commitHash`Retrieve detailed information for one or more commits, including blame annotations and referenced conversation metadata.

This endpoint is in limited alpha and only available to select users. Response shapes may change.

#### Path Parameters

`commitHash` string

Single commit hash or comma-separated list of hashes (e.g., `abc123,def456`)#### Query Parameters

`branch` string

Optional filter by branch name
#### Response Fields

Returns an object containing `commits` and `conversations` arrays.

FieldTypeDescription`commits`arrayArray of commit objects with blame annotations`commits[].commitSource`"ide" | "cli" | "cloud"Where the commit originated.`commits[].rangeAnnotations`arrayFile-level blame data for the commit`commits[].rangeAnnotations[].filePath`stringPath to the file within the repository`commits[].rangeAnnotations[].groups`arrayArray of annotation groups`commits[].rangeAnnotations[].groups[].conversationId`string | nullID of the conversation that generated this code`commits[].rangeAnnotations[].groups[].model`string | nullAI model used to generate the code`commits[].rangeAnnotations[].groups[].operationType`stringType of operation performed`commits[].rangeAnnotations[].groups[].ranges`arrayArray of line ranges affected by this annotation`commits[].rangeAnnotations[].groups[].ranges[].start`numberStarting line number`commits[].rangeAnnotations[].groups[].ranges[].end`numberEnding line number`conversations`arrayConversation metadata for all referenced conversations`conversations[].id`stringUnique conversation identifier`conversations[].title`string | nullConversation title`conversations[].tldr`string | nullBrief summary`conversations[].overview`string | nullDetailed overview`conversations[].summaryBullets`array | nullArray of summary bullet pointsResponse format is consistent even when requesting a single commit.

**Single commit:**

```
curl -X GET "https://api.cursor.com/analytics/ai-code/commits/0aabf603dc906e05bf5e4d9fd423fdd517f2e43f?branch=main" \
  -u YOUR_API_KEY:
```

**Multiple commits:**

```
curl -X GET "https://api.cursor.com/analytics/ai-code/commits/abc123,def456,ghi789" \
  -u YOUR_API_KEY:
```

**Response:**

```
{
  "commits": [
    {
      "commitHash": "0aabf603dc906e05bf5e4d9fd423fdd517f2e43f",
      "commitSource": "ide",
      "rangeAnnotations": [
        {
          "filePath": "src/analytics/report.ts",
          "groups": [
            {
              "conversationId": "conv_abc123",
              "model": "gpt-4o",
              "operationType": "insert",
              "ranges": [
                { "start": 10, "end": 25 },
                { "start": 42, "end": 58 }
              ]
            }
          ]
        }
      ]
    }
  ],
  "conversations": [
    {
      "id": "conv_abc123",
      "title": "Refactor analytics module",
      "tldr": "Extracted report generation into separate functions",
      "overview": "Refactored the analytics module to improve maintainability by extracting report generation logic.",
      "summaryBullets": [
        "Created dedicated report generator class",
        "Added unit tests for new functions",
        "Updated imports across affected files"
      ]
    }
  ]
}
```

---

## Common Query Parameters

All endpoints accept the same query parameters via query string:

ParameterTypeRequiredDescription`startDate`string | dateNoISO date string, the literal "now", or relative days like "7d" (means now - 7 days). Default: now - 7 days`endDate`string | dateNoISO date string, the literal "now", or relative days like "0d". Default: now`page`numberNoPage number (1-based). Default: 1`pageSize`numberNoResults per page. Default: 100, Max: 1000`user`stringNoOptional filter by a single user. Accepts email (e.g., [developer@company.com](mailto:developer@company.com)), encoded ID (e.g., user_abc123...), or numeric ID (e.g., 42)
Responses return userId as an encoded external ID with the prefix user_. This
is stable for API consumption.

## Semantics and How Metrics Are Computed

- **Sources**: "TAB" represents inline completions that were accepted; "COMPOSER" represents accepted diffs from Agent edits
- **Lines metrics**: tabLinesAdded/Deleted and composerLinesAdded/Deleted are separately counted; nonAiLinesAdded/Deleted are derived as max(0, totalLines - AI lines)
- **Privacy mode**: If enabled in the client, some metadata (like fileName) may be omitted
- **Branch info**: isPrimaryBranch is true when the current branch equals the repo's default branch; may be undefined if repo info is unavailable

You can scan that file to understand how commits and changes are detected and reported.

## Tips

- Use `user` parameter to quickly filter a single user across all endpoints
- For large data extractions, prefer CSV endpoints—they stream in pages of 10,000 records server-side
- `isPrimaryBranch` may be undefined if the client couldn't resolve the default branch
- `commitTs` is the commit timestamp; `createdAt` is the ingestion time on our servers
- Some fields may be absent when privacy mode is enabled on the client
- Commit hashes are not unique or unchangeable. For example, you may see the same commit twice if you amend commits with extra information.
- Commit timestamps will remain unchanged even if the commit is amended.

## Changelog

- **Alpha release**: Initial endpoints for commits and changes. Response shapes may evolve based on feedback

AI Code Tracking is available on the Enterprise plan

Contact our team to get access to detailed AI usage metrics.

[Contact Sales](https://cursor.com/contact-sales?source=docs-ai-code-tracking)


