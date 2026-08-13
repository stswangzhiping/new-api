package controller

import (
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

func GetSubscription(c *gin.Context) {
	var remainQuota int
	var usedQuota int
	var err error
	var token *model.Token
	var expiredTime int64
	if common.DisplayTokenStatEnabled {
		tokenId := c.GetInt("token_id")
		token, err = model.GetTokenById(tokenId)
		expiredTime = token.ExpiredTime
		remainQuota = token.RemainQuota
		usedQuota = token.UsedQuota
	} else {
		userId := c.GetInt("id")
		remainQuota, err = model.GetUserQuota(userId, false)
		usedQuota, err = model.GetUserUsedQuota(userId)
	}
	if expiredTime <= 0 {
		expiredTime = 0
	}
	if err != nil {
		openAIError := types.OpenAIError{
			Message: err.Error(),
			Type:    "upstream_error",
		}
		c.JSON(200, gin.H{
			"error": openAIError,
		})
		return
	}
	quota := remainQuota + usedQuota
	amount := float64(quota)
	// OpenAI 兼容接口中的 *_USD 字段含义保持“额度单位”对应值：
	// 我们将其解释为以“站点展示类型”为准：
	// - USD: 直接除以 QuotaPerUnit
	// - CNY: 先转 USD 再乘汇率
	// - TOKENS: 直接使用 tokens 数量
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeCNY:
		amount = amount / common.QuotaPerUnit * operation_setting.USDExchangeRate
	case operation_setting.QuotaDisplayTypeTokens:
		// amount 保持 tokens 数值
	default:
		amount = amount / common.QuotaPerUnit
	}
	if token != nil && token.UnlimitedQuota {
		amount = 100000000
	}
	subscription := OpenAISubscriptionResponse{
		Object:             "billing_subscription",
		HasPaymentMethod:   true,
		SoftLimitUSD:       amount,
		HardLimitUSD:       amount,
		SystemHardLimitUSD: amount,
		AccessUntil:        expiredTime,
	}
	c.JSON(200, subscription)
	return
}

func GetUsage(c *gin.Context) {
	var quota int
	var err error
	var token *model.Token
	if common.DisplayTokenStatEnabled {
		tokenId := c.GetInt("token_id")
		token, err = model.GetTokenById(tokenId)
		quota = token.UsedQuota
	} else {
		userId := c.GetInt("id")
		quota, err = model.GetUserUsedQuota(userId)
	}
	if err != nil {
		openAIError := types.OpenAIError{
			Message: err.Error(),
			Type:    "new_api_error",
		}
		c.JSON(200, gin.H{
			"error": openAIError,
		})
		return
	}
	amount := float64(quota)
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeCNY:
		amount = amount / common.QuotaPerUnit * operation_setting.USDExchangeRate
	case operation_setting.QuotaDisplayTypeTokens:
		// tokens 保持原值
	default:
		amount = amount / common.QuotaPerUnit
	}
	usage := OpenAIUsageResponse{
		Object:     "list",
		TotalUsage: amount * 100,
	}
	c.JSON(200, usage)
	return
}

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
