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
	if err := ensureBillingHistory(userId, true); err != nil {
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
			if err2 := ensureBillingHistory(userId, true); err2 != nil {
				common.SysLog("billing generate warn: " + err2.Error())
			}
		}
	}
	billings, total, err := model.GetAllCcBillingsForAdmin(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if userId > 0 && total == 0 {
		if err = ensureBillingHistory(userId, true); err != nil {
			common.SysLog("billing force generate warn: " + err.Error())
		}
		billings, total, err = model.GetAllCcBillingsForAdmin(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
		if err != nil {
			common.ApiError(c, err)
			return
		}
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(billings)
	common.ApiSuccess(c, pageInfo)
}

func ensureBillingHistory(userId int, force bool) error {
	user, err := model.GetUserById(userId, false)
	if err != nil {
		return err
	}
	loc := time.FixedZone("CST", 8*3600)
	last := time.Now().In(loc).AddDate(0, -1, 0)
	start := time.Date(last.Year(), last.Month(), 1, 0, 0, 0, 0, loc)
	if user.CreatedAt > 0 {
		createdAt := time.Unix(user.CreatedAt, 0).In(loc)
		start = time.Date(createdAt.Year(), createdAt.Month(), 1, 0, 0, 0, 0, loc)
	}
	end := time.Date(last.Year(), last.Month(), 1, 0, 0, 0, 0, loc)
	if start.After(end) {
		return nil
	}
	for cursor := start; !cursor.After(end); cursor = cursor.AddDate(0, 1, 0) {
		if force {
			err = model.ComputeAndSaveBillingForMonthForce(userId, cursor.Year(), int(cursor.Month()))
		} else {
			err = model.ComputeAndSaveBillingForMonth(userId, cursor.Year(), int(cursor.Month()))
		}
		if err != nil {
			return err
		}
	}
	return nil
}
