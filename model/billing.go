package model

import (
	"time"

	"github.com/QuantumNous/new-api/common"
)

// CcBilling stores monthly billing snapshots per user.
// Generated on-demand when the user queries billing for a past month.
type CcBilling struct {
	Id             int    `json:"id"              gorm:"primarykey"`
	UserId         int    `json:"user_id"         gorm:"uniqueIndex:uq_cc_billing_user_month;not null"`
	Year           int    `json:"year"            gorm:"uniqueIndex:uq_cc_billing_user_month;not null"`
	Month          int    `json:"month"           gorm:"uniqueIndex:uq_cc_billing_user_month;not null"`
	OpeningQuota   int64  `json:"opening_quota"   gorm:"default:0"`
	ClosingQuota   int64  `json:"closing_quota"   gorm:"default:0"`
	TopupTotal     int64  `json:"topup_total"     gorm:"default:0"`
	TopupPurchase  int64  `json:"topup_purchase"  gorm:"default:0"`
	TopupGift      int64  `json:"topup_gift"      gorm:"default:0"`
	UsedQuota      int64  `json:"used_quota"      gorm:"default:0"`
	ModelBreakdown string `json:"model_breakdown" gorm:"type:text"` // JSON
	GeneratedAt    int64  `json:"generated_at"    gorm:"default:0"`
}

// ModelBreakdownItem represents per-model consumption in a billing month.
type ModelBreakdownItem struct {
	Model            string `json:"model"`
	Calls            int64  `json:"calls"`
	PromptTokens     int64  `json:"promptTokens"`
	CompletionTokens int64  `json:"completionTokens"`
	Quota            int64  `json:"quota"`
}

// ─── query helpers ────────────────────────────────────────────────────────────

func CcBillingExistsByUserMonth(userId, year, month int) (bool, error) {
	var count int64
	err := DB.Model(&CcBilling{}).
		Where("user_id = ? AND year = ? AND month = ?", userId, year, month).
		Count(&count).Error
	return count > 0, err
}

func GetCcBillingByUserMonth(userId, year, month int) (*CcBilling, error) {
	var b CcBilling
	err := DB.Where("user_id = ? AND year = ? AND month = ?", userId, year, month).First(&b).Error
	return &b, err
}

func GetCcBillingsByUser(userId int) ([]*CcBilling, error) {
	var list []*CcBilling
	err := DB.Where("user_id = ?", userId).
		Order("year desc, month desc").
		Find(&list).Error
	return list, err
}

// GetAllCcBillingsForAdmin returns all billing records, optionally filtered by userId.
func GetAllCcBillingsForAdmin(userId int, startIdx, num int) (billings []*CcBilling, total int64, err error) {
	q := DB.Model(&CcBilling{})
	if userId > 0 {
		q = q.Where("user_id = ?", userId)
	}
	if err = q.Count(&total).Error; err != nil {
		return
	}
	err = q.Order("year desc, month desc").Limit(num).Offset(startIdx).Find(&billings).Error
	return
}

func SaveCcBilling(b *CcBilling) error {
	return DB.Save(b).Error
}

// ─── computation ──────────────────────────────────────────────────────────────

// ComputeAndSaveBillingForMonth generates the billing record for (userId, year, month)
// if it does not already exist, and returns the full billing list for that user.
func ComputeAndSaveBillingForMonth(userId int, year, month int) error {
	return computeAndSaveBillingForMonth(userId, year, month, false)
}

// ComputeAndSaveBillingForMonthForce generates the billing record even when
// the computed snapshot is all zero. This is used by admin-triggered queries.
func ComputeAndSaveBillingForMonthForce(userId int, year, month int) error {
	return computeAndSaveBillingForMonth(userId, year, month, true)
}

func computeAndSaveBillingForMonth(userId int, year, month int, forceSave bool) error {
	exists, err := CcBillingExistsByUserMonth(userId, year, month)
	if err != nil || exists {
		return err
	}

	// Time boundaries (Unix timestamp, seconds) in local/server time.
	loc := time.FixedZone("CST", 8*3600)
	mStart := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, loc).Unix()
	mEnd := time.Date(year, time.Month(month+1), 1, 0, 0, 0, 0, loc).Unix()


	// Current month (for back-calculation)
	now := time.Now().In(loc)
	curYear, curMonth := now.Year(), int(now.Month())
	curStart := time.Date(curYear, time.Month(curMonth), 1, 0, 0, 0, 0, loc).Unix()
	curEnd := now.Unix()

	// Query logs for target month
	type quotaSum struct {
		Total int64
	}
	var lastMonthConsume, lastMonthTopup quotaSum
	var curMonthConsume, curMonthTopup quotaSum

	LOG_DB.Model(&Log{}).
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?", userId, LogTypeConsume, mStart, mEnd).
		Select("COALESCE(SUM(quota), 0) as total").
		Scan(&lastMonthConsume)

	LOG_DB.Model(&Log{}).
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?", userId, LogTypeTopup, mStart, mEnd).
		Select("COALESCE(SUM(quota), 0) as total").
		Scan(&lastMonthTopup)

	LOG_DB.Model(&Log{}).
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?", userId, LogTypeConsume, curStart, curEnd).
		Select("COALESCE(SUM(quota), 0) as total").
		Scan(&curMonthConsume)

	LOG_DB.Model(&Log{}).
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?", userId, LogTypeTopup, curStart, curEnd).
		Select("COALESCE(SUM(quota), 0) as total").
		Scan(&curMonthTopup)

	// Topup purchase/gift breakdown for target month (via redemptions)
	var topupPurchase, topupGift int64
	type rdSum struct {
		Total int64
	}
	var purSum, giftSum rdSum
	DB.Model(&Redemption{}).
		Where("used_user_id = ? AND cc_source = ? AND redeemed_time >= ? AND redeemed_time < ?", userId, CcSourcePurchase, mStart, mEnd).
		Select("COALESCE(SUM(quota), 0) as total").
		Scan(&purSum)
	DB.Model(&Redemption{}).
		Where("used_user_id = ? AND (cc_source = ? OR cc_source = ?) AND redeemed_time >= ? AND redeemed_time < ?", userId, CcSourceUnknown, CcSourceActivity, mStart, mEnd).
		Select("COALESCE(SUM(quota), 0) as total").
		Scan(&giftSum)
	topupPurchase = purSum.Total
	topupGift = giftSum.Total

	// Current quota from users table
	var user User
	if err := DB.Select("quota").Where("id = ?", userId).First(&user).Error; err != nil {
		return err
	}
	currentQuota := int64(user.Quota)

	// Back-calculate closing quota of last month (= opening of current month)
	closingQuota := currentQuota + curMonthConsume.Total - curMonthTopup.Total
	if closingQuota < 0 {
		closingQuota = 0
	}

	// Back-calculate opening quota of target month
	openingQuota := closingQuota + lastMonthConsume.Total - lastMonthTopup.Total
	if openingQuota < 0 {
		openingQuota = 0
	}

	// Model breakdown for target month
	type modelRow struct {
		ModelName        string `gorm:"column:model_name"`
		Calls            int64  `gorm:"column:calls"`
		PromptTokens     int64  `gorm:"column:prompt_tokens"`
		CompletionTokens int64  `gorm:"column:completion_tokens"`
		Quota            int64  `gorm:"column:quota"`
	}
	var rows []modelRow
	LOG_DB.Model(&Log{}).
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?", userId, LogTypeConsume, mStart, mEnd).
		Select("model_name, COUNT(*) as calls, COALESCE(SUM(prompt_tokens),0) as prompt_tokens, COALESCE(SUM(completion_tokens),0) as completion_tokens, COALESCE(SUM(quota),0) as quota").
		Group("model_name").
		Order("quota desc").
		Scan(&rows)

	breakdownItems := make([]ModelBreakdownItem, 0, len(rows))
	for _, r := range rows {
		breakdownItems = append(breakdownItems, ModelBreakdownItem{
			Model:            r.ModelName,
			Calls:            r.Calls,
			PromptTokens:     r.PromptTokens,
			CompletionTokens: r.CompletionTokens,
			Quota:            r.Quota,
		})
	}
	breakdownJSON, _ := common.Marshal(breakdownItems)

	// Skip saving an all-zero record — user likely did not exist or had no activity that month.
	if !forceSave && openingQuota == 0 && closingQuota == 0 && lastMonthTopup.Total == 0 && lastMonthConsume.Total == 0 {
		return nil
	}

	bill := &CcBilling{
		UserId:         userId,
		Year:           year,
		Month:          month,
		OpeningQuota:   openingQuota,
		ClosingQuota:   closingQuota,
		TopupTotal:     lastMonthTopup.Total,
		TopupPurchase:  topupPurchase,
		TopupGift:      topupGift,
		UsedQuota:      lastMonthConsume.Total,
		ModelBreakdown: string(breakdownJSON),
		GeneratedAt:    common.GetTimestamp(),
	}
	return SaveCcBilling(bill)
}
