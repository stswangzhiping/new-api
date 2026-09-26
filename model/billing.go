package model

import (
	"time"

	"github.com/QuantumNous/new-api/common"
)

// CcBilling stores the monthly billing snapshot used by the CUTOS billing UI.
type CcBilling struct {
	Id             int    `json:"id" gorm:"primarykey"`
	UserId         int    `json:"user_id" gorm:"uniqueIndex:uq_cc_billing_user_month;not null"`
	Year           int    `json:"year" gorm:"uniqueIndex:uq_cc_billing_user_month;not null"`
	Month          int    `json:"month" gorm:"uniqueIndex:uq_cc_billing_user_month;not null"`
	OpeningQuota   int64  `json:"opening_quota" gorm:"default:0"`
	ClosingQuota   int64  `json:"closing_quota" gorm:"default:0"`
	TopupTotal     int64  `json:"topup_total" gorm:"default:0"`
	TopupPurchase  int64  `json:"topup_purchase" gorm:"default:0"`
	TopupGift      int64  `json:"topup_gift" gorm:"default:0"`
	UsedQuota      int64  `json:"used_quota" gorm:"default:0"`
	ModelBreakdown string `json:"model_breakdown" gorm:"type:text"`
	GeneratedAt    int64  `json:"generated_at" gorm:"default:0"`
}

type ModelBreakdownItem struct {
	Model            string `json:"model"`
	Calls            int64  `json:"calls"`
	PromptTokens     int64  `json:"promptTokens"`
	CompletionTokens int64  `json:"completionTokens"`
	Quota            int64  `json:"quota"`
}

func CcBillingExistsByUserMonth(userId, year, month int) (bool, error) {
	var count int64
	err := DB.Model(&CcBilling{}).
		Where("user_id = ? AND year = ? AND month = ?", userId, year, month).
		Count(&count).Error
	return count > 0, err
}

func GetCcBillingsByUser(userId int) ([]*CcBilling, error) {
	var list []*CcBilling
	err := DB.Where("user_id = ?", userId).
		Order("year desc, month desc").
		Find(&list).Error
	return list, err
}

func GetAllCcBillingsForAdmin(userId int, startIdx, num int) (billings []*CcBilling, total int64, err error) {
	query := DB.Model(&CcBilling{})
	if userId > 0 {
		query = query.Where("user_id = ?", userId)
	}
	if err = query.Count(&total).Error; err != nil {
		return
	}
	err = query.Order("year desc, month desc").Limit(num).Offset(startIdx).Find(&billings).Error
	return
}

func SaveCcBilling(billing *CcBilling) error {
	return DB.Save(billing).Error
}

func ComputeAndSaveBillingForMonth(userId int, year, month int) error {
	return computeAndSaveBillingForMonth(userId, year, month, false)
}

func ComputeAndSaveBillingForMonthForce(userId int, year, month int) error {
	return computeAndSaveBillingForMonth(userId, year, month, true)
}

func computeAndSaveBillingForMonth(userId int, year, month int, forceSave bool) error {
	exists, err := CcBillingExistsByUserMonth(userId, year, month)
	if err != nil || exists {
		return err
	}

	location := time.FixedZone("CST", 8*60*60)
	monthStart := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, location).Unix()
	monthEnd := time.Date(year, time.Month(month+1), 1, 0, 0, 0, 0, location).Unix()

	var user User
	if err := DB.Select("quota", "created_at").Where("id = ?", userId).First(&user).Error; err != nil {
		return err
	}
	if user.CreatedAt >= monthEnd {
		return nil
	}

	now := time.Now().In(location)
	currentMonthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, location).Unix()

	type quotaSum struct {
		Total int64
	}
	var monthConsume, monthTopup quotaSum
	var currentMonthConsume, currentMonthTopup quotaSum

	LOG_DB.Model(&Log{}).
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?", userId, LogTypeConsume, monthStart, monthEnd).
		Select("COALESCE(SUM(quota), 0) as total").
		Scan(&monthConsume)
	LOG_DB.Model(&Log{}).
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?", userId, LogTypeTopup, monthStart, monthEnd).
		Select("COALESCE(SUM(quota), 0) as total").
		Scan(&monthTopup)
	LOG_DB.Model(&Log{}).
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?", userId, LogTypeConsume, currentMonthStart, now.Unix()).
		Select("COALESCE(SUM(quota), 0) as total").
		Scan(&currentMonthConsume)
	LOG_DB.Model(&Log{}).
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?", userId, LogTypeTopup, currentMonthStart, now.Unix()).
		Select("COALESCE(SUM(quota), 0) as total").
		Scan(&currentMonthTopup)

	var topupPurchase, topupGift quotaSum
	DB.Model(&Redemption{}).
		Where("used_user_id = ? AND cc_source = ? AND redeemed_time >= ? AND redeemed_time < ?", userId, CcSourcePurchase, monthStart, monthEnd).
		Select("COALESCE(SUM(quota), 0) as total").
		Scan(&topupPurchase)
	DB.Model(&Redemption{}).
		Where("used_user_id = ? AND (cc_source = ? OR cc_source = ?) AND redeemed_time >= ? AND redeemed_time < ?", userId, CcSourceUnknown, CcSourceActivity, monthStart, monthEnd).
		Select("COALESCE(SUM(quota), 0) as total").
		Scan(&topupGift)

	closingQuota := int64(user.Quota) + currentMonthConsume.Total - currentMonthTopup.Total
	if closingQuota < 0 {
		closingQuota = 0
	}
	openingQuota := closingQuota + monthConsume.Total - monthTopup.Total
	if openingQuota < 0 {
		openingQuota = 0
	}

	type modelRow struct {
		ModelName        string `gorm:"column:model_name"`
		Calls            int64  `gorm:"column:calls"`
		PromptTokens     int64  `gorm:"column:prompt_tokens"`
		CompletionTokens int64  `gorm:"column:completion_tokens"`
		Quota            int64  `gorm:"column:quota"`
	}
	var rows []modelRow
	LOG_DB.Model(&Log{}).
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?", userId, LogTypeConsume, monthStart, monthEnd).
		Select("model_name, COUNT(*) as calls, COALESCE(SUM(prompt_tokens), 0) as prompt_tokens, COALESCE(SUM(completion_tokens), 0) as completion_tokens, COALESCE(SUM(quota), 0) as quota").
		Group("model_name").
		Order("quota desc").
		Scan(&rows)

	breakdownItems := make([]ModelBreakdownItem, 0, len(rows))
	for _, row := range rows {
		breakdownItems = append(breakdownItems, ModelBreakdownItem{
			Model:            row.ModelName,
			Calls:            row.Calls,
			PromptTokens:     row.PromptTokens,
			CompletionTokens: row.CompletionTokens,
			Quota:            row.Quota,
		})
	}
	breakdownJSON, _ := common.Marshal(breakdownItems)

	if !forceSave && openingQuota == 0 && closingQuota == 0 && monthTopup.Total == 0 && monthConsume.Total == 0 {
		return nil
	}

	billing := &CcBilling{
		UserId:         userId,
		Year:           year,
		Month:          month,
		OpeningQuota:   openingQuota,
		ClosingQuota:   closingQuota,
		TopupTotal:     monthTopup.Total,
		TopupPurchase:  topupPurchase.Total,
		TopupGift:      topupGift.Total,
		UsedQuota:      monthConsume.Total,
		ModelBreakdown: string(breakdownJSON),
		GeneratedAt:    common.GetTimestamp(),
	}
	return SaveCcBilling(billing)
}
