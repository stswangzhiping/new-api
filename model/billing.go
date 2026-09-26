package model

// CcBilling stores the monthly billing snapshot used by the CUTOS billing UI.
// The calculation and API behavior are migrated separately from this schema.
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
