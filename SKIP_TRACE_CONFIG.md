# Skip Trace & Data Enrichment Configuration

## Environment Variables

### Skip Trace Provider Configuration

```bash
# Skip trace provider selection
# Options: 'none' (default), 'noop', or custom provider names
SKIP_TRACE_PROVIDER=none

# Maximum skip trace requests per day (optional, not enforced by default)
SKIP_TRACE_MAX_PER_DAY=100

# Default markets for buyer intelligence
# Format: STATE-MARKET (e.g., TX-DFW, TX-HOUSTON)
# Comma-separated list
DEFAULT_MARKETS=TX-DFW,TX-HOUSTON
```

### Provider-Specific Configuration

When implementing custom providers (e.g., BatchSkipTrace, PeopleDataLabs, etc.), add provider-specific environment variables:

```bash
# Example for a hypothetical BatchSkipTrace provider
BATCH_SKIPTRACE_API_KEY=your_api_key_here
BATCH_SKIPTRACE_API_URL=https://api.batchskiptrace.com

# Example for a hypothetical PeopleDataLabs provider
PEOPLE_DATALABS_API_KEY=your_api_key_here
```

## Default Configuration

- **Provider**: `none` (uses NoopProvider - safe default for development)
- **Default Markets**: `TX-DFW,TX-HOUSTON`
- **Skip Trace Locking**: Disabled by default (admin can lock individual leads)

## Adding Custom Providers

To add a custom skip trace provider:

1. Create a new provider class in `utils/skipTraceProviders/` extending `BaseProvider`
2. Implement `skipTraceLead(lead)` and `estimateCost(lead)` methods
3. Update `services/skipTraceService.js` to load your provider based on `SKIP_TRACE_PROVIDER`

Example:

```javascript
// utils/skipTraceProviders/myCustomProvider.js
const BaseProvider = require('./baseProvider');

class MyCustomProvider extends BaseProvider {
  async skipTraceLead(lead) {
    // Your API call logic here
    // Return normalized result:
    return {
      phones: [{ number: '+1234567890', type: 'mobile', confidence: 90 }],
      emails: [{ email: 'example@email.com', confidence: 85 }],
      mailingAddresses: [{ address: '123 Main St', confidence: 95 }],
      entityInfo: {
        isLLC: true,
        entityName: 'Example LLC',
        registeredState: 'TX'
      },
      confidenceScore: 85
    };
  }

  async estimateCost(lead) {
    return 50; // Cost in cents or currency unit
  }
}

module.exports = MyCustomProvider;
```

Then in `services/skipTraceService.js`:

```javascript
case 'mycustom':
  const MyCustomProvider = require('../utils/skipTraceProviders/myCustomProvider');
  provider = new MyCustomProvider();
  break;
```

## Market System

The market system uses the format: `STATE-MARKET` (e.g., `TX-DFW`, `CA-LA`, `NY-NYC`).

- Markets are normalized to uppercase
- Invalid markets are filtered out automatically
- System supports all 50 US states
- Default markets can be overridden via `DEFAULT_MARKETS` environment variable

## Compliance & Safety

- Skip trace data is masked for dialers (status and counts only)
- Closers and managers see full skip trace data
- Skip trace can be locked per lead (admin only to unlock)
- All skip trace requests are logged via KPI events
- Sensitive data (SSN, DOB) is never stored even if provider returns it

