package controller

import (
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// GetOperationsSummary handles GET /api/operations/summary?year=2026&month=4
// Admin-only: returns aggregated operational metrics for a given month.
func GetOperationsSummary(c *gin.Context) {
	now := time.Now()
	year := now.Year()
	month := int(now.Month())

	if y, err := strconv.Atoi(c.Query("year")); err == nil && y > 2000 {
		year = y
	}
	if m, err := strconv.Atoi(c.Query("month")); err == nil && m >= 1 && m <= 12 {
		month = m
	}

	startTs := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.Local).Unix()
	endTs := time.Date(year, time.Month(month+1), 1, 0, 0, 0, 0, time.Local).Unix()

	// Consumed quota (type=2 logs)
	consumedQuota, err := model.SumLogQuotaByType(model.LogTypeConsume, startTs, endTs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	// System gift quota (type=4 logs, stored as negative — take absolute)
	giftQuota, err := model.SumLogQuotaByType(model.LogTypeSystem, startTs, endTs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	// Topup quota (type=1 logs)
	topupQuota, err := model.SumLogQuotaByType(model.LogTypeTopup, startTs, endTs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	// New users created in this month
	newUserCount, err := model.CountNewUsers(startTs, endTs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	// Distinct active users (made at least one consume call)
	activeUserCount, err := model.CountActiveUsers(startTs, endTs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	// Total remaining quota (all users)
	totalRemainingQuota, err := model.SumAllUsersQuota()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	// Channel breakdown for this month
	channelBreakdown, err := model.GetChannelQuotaBreakdown(startTs, endTs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	if channelBreakdown == nil {
		channelBreakdown = []model.OperationsChannelQuota{}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"year":                  year,
			"month":                 month,
			"consumed_quota":        consumedQuota,
			"gift_quota":            giftQuota,
			"topup_quota":           topupQuota,
			"new_user_count":        newUserCount,
			"active_user_count":     activeUserCount,
			"total_remaining_quota": totalRemainingQuota,
			"channel_breakdown":     channelBreakdown,
		},
	})
}
