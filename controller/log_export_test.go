package controller

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGetCSVLogUsageIncludesBillingAuditFields(t *testing.T) {
	firstToken, cacheRead, cacheWrite, longContext, webSearchCalls := getCSVLogUsage(`{
		"frt": 1234,
		"cache_tokens": 21,
		"cache_creation_tokens_5m": 8,
		"cache_creation_tokens_1h": 13,
		"matched_tier": "long_context",
		"web_search_call_count": 1,
		"tool_surcharges": [
			{"name":"web_search","count":2,"price":10},
			{"name":"image_generation","count":1,"price":150}
		]
	}`)

	require.Equal(t, "1.234", firstToken)
	require.EqualValues(t, 21, cacheRead)
	require.EqualValues(t, 21, cacheWrite)
	require.Equal(t, 1, longContext)
	require.EqualValues(t, 2, webSearchCalls)
}

func TestGetCSVLogUsageMarksHistoricalSecondTierAsLongContext(t *testing.T) {
	_, _, _, longContext, webSearchCalls := getCSVLogUsage(`{"matched_tier":"第2档"}`)

	require.Equal(t, 1, longContext)
	require.Zero(t, webSearchCalls)
}
