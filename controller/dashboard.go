package controller

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// GetSubscription returns an OpenAI-compatible billing subscription response.
func GetSubscription(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"object":                "billing_subscription",
		"has_payment_method":    false,
		"canceled":              false,
		"canceled_at":           nil,
		"delinquent":            nil,
		"access_until":          time.Now().AddDate(1, 0, 0).Unix(),
		"soft_limit":            0,
		"hard_limit":            0,
		"system_hard_limit":     0,
		"soft_limit_usd":        0,
		"hard_limit_usd":        9999.0,
		"system_hard_limit_usd": 9999.0,
		"plan": gin.H{
			"title": "pay-as-you-go",
			"id":    "payg",
		},
		"is_arrears_eligible":        false,
		"max_balance":                9999.0,
		"legal_name":                 nil,
		"po_number":                  nil,
		"billing_email":              nil,
		"tax_ids":                    nil,
		"billing_address":            nil,
		"business_address":           nil,
		"primary_emails":             nil,
		"is_prepaid_allowed":         true,
		"is_commercial_policy_shown": true,
		"is_chargebee_customer":      false,
	})
}

// GetUsage returns an OpenAI-compatible billing usage response.
func GetUsage(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"object":      "list",
		"daily_costs": []interface{}{},
		"total_usage": 0,
	})
}
