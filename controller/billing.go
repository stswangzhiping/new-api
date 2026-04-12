package controller

import (
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetUserBilling handles GET /api/billing/self
// Generates last-month billing on-demand, returns all billing for current user.
func GetUserBilling(c *gin.Context) {
	userId := c.GetInt("id")
	if err := ensureLastMonthBilling(userId); err != nil {
		common.SysLog("billing generate warn: " + err.Error())
	}
	billings, err := model.GetCcBillingsByUser(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, billings)
}

// GetAdminBilling handles GET /api/billing/
// Admin-only: returns all billing records, optionally filtered by ?user_id=
func GetAdminBilling(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	userId := 0
	if uidStr := c.Query("user_id"); uidStr != "" {
		if uid, err := strconv.Atoi(uidStr); err == nil {
			userId = uid
			// Also trigger generation for this user
			if err2 := ensureLastMonthBilling(userId); err2 != nil {
				common.SysLog("billing generate warn: " + err2.Error())
			}
		}
	}
	billings, total, err := model.GetAllCcBillingsForAdmin(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(billings)
	common.ApiSuccess(c, pageInfo)
}

// ensureLastMonthBilling generates last month's billing for userId if not yet exist.
func ensureLastMonthBilling(userId int) error {
	loc := time.FixedZone("CST", 8*3600)
	last := time.Now().In(loc).AddDate(0, -1, 0)
	return model.ComputeAndSaveBillingForMonth(userId, last.Year(), int(last.Month()))
}
