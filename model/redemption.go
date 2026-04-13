package model

import (
	"errors"
	"fmt"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"gorm.io/gorm"
)

// ErrRedeemFailed is returned when redemption fails due to database error
var ErrRedeemFailed = errors.New("redeem.failed")

// CcSource constants: source of redemption code
const (
	CcSourceUnknown    = 0 // 未知来源
	CcSourceActivity   = 1 // 活动赠送（不可退款）
	CcSourcePurchase   = 2 // 用户购买（可退款）
	CcSourceAdjustment = 3 // 调账（人工账务调整，不可退款）
)

type Redemption struct {
	Id           int            `json:"id"`
	UserId       int            `json:"user_id"`
	Key          string         `json:"key" gorm:"type:char(32);uniqueIndex"`
	Status       int            `json:"status" gorm:"default:1"`
	Name         string         `json:"name" gorm:"index"`
	Quota        int            `json:"quota" gorm:"default:100"`
	CreatedTime  int64          `json:"created_time" gorm:"bigint"`
	RedeemedTime int64          `json:"redeemed_time" gorm:"bigint"`
	Count        int            `json:"count" gorm:"-:all"` // only for api request
	UsedUserId   int            `json:"used_user_id"`
	DeletedAt    gorm.DeletedAt `gorm:"index"`
	ExpiredTime  int64          `json:"expired_time" gorm:"bigint"` // 过期时间，0 表示不过期
	// cc_ prefixed fields: claw-cloud extensions, safe from upstream conflicts
	CcSource     int    `json:"cc_source" gorm:"column:cc_source;default:0"`              // 来源：0=未知 1=活动赠送 2=用户购买 3=调账
	CcOrderId    string `json:"cc_order_id" gorm:"column:cc_order_id;default:''"`         // 关联订单号（购买时填写）
	CcRefundable bool   `json:"cc_refundable" gorm:"column:cc_refundable;default:false"`  // 是否可退款
	CcRemark     string `json:"cc_remark" gorm:"column:cc_remark;default:''"`             // 备注说明
}

// GetAllRedemptions returns all redemptions with optional status/ccSource filters.
// Pass status=-1 or ccSource=-1 to skip that filter.
func GetAllRedemptions(startIdx int, num int, status int, ccSource int) (redemptions []*Redemption, total int64, err error) {
	return SearchRedemptions("", status, ccSource, startIdx, num)
}

// SearchRedemptions searches redemptions by keyword and optional status/ccSource filters.
// Pass status=-1 or ccSource=-1 to skip that filter.
func SearchRedemptions(keyword string, status int, ccSource int, startIdx int, num int) (redemptions []*Redemption, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&Redemption{})

	// Keyword search: match id / name / redeemer username
	if keyword != "" {
		var matchedUserIds []int
		DB.Model(&User{}).Where("username LIKE ?", "%"+keyword+"%").Pluck("id", &matchedUserIds)
		if id, convErr := strconv.Atoi(keyword); convErr == nil {
			if len(matchedUserIds) > 0 {
				query = query.Where("id = ? OR name LIKE ? OR used_user_id IN ?", id, keyword+"%", matchedUserIds)
			} else {
				query = query.Where("id = ? OR name LIKE ?", id, keyword+"%")
			}
		} else {
			if len(matchedUserIds) > 0 {
				query = query.Where("name LIKE ? OR used_user_id IN ?", keyword+"%", matchedUserIds)
			} else {
				query = query.Where("name LIKE ?", keyword+"%")
			}
		}
	}

	// Optional filters
	if status >= 0 {
		query = query.Where("status = ?", status)
	}
	if ccSource >= 0 {
		query = query.Where("cc_source = ?", ccSource)
	}

	// Get total count
	err = query.Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Get paginated data
	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&redemptions).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return redemptions, total, nil
}

// GetRedemptionsByUsedUserId returns redemptions that have been redeemed by the given user.
func GetRedemptionsByUsedUserId(usedUserId, startIdx, num int) (redemptions []*Redemption, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()
	q := tx.Model(&Redemption{}).Where("used_user_id = ?", usedUserId)
	if err = q.Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err = q.Order("redeemed_time desc").Limit(num).Offset(startIdx).Find(&redemptions).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return redemptions, total, nil
}

func GetRedemptionById(id int) (*Redemption, error) {
	if id == 0 {
		return nil, errors.New("id 为空！")
	}
	redemption := Redemption{Id: id}
	var err error = nil
	err = DB.First(&redemption, "id = ?", id).Error
	return &redemption, err
}

func Redeem(key string, userId int) (quota int, err error) {
	if key == "" {
		return 0, errors.New("未提供兑换码")
	}
	if userId == 0 {
		return 0, errors.New("无效的 user id")
	}
	redemption := &Redemption{}

	keyCol := "`key`"
	if common.UsingPostgreSQL {
		keyCol = `"key"`
	}
	common.RandomSleep()
	err = DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Set("gorm:query_option", "FOR UPDATE").Where(keyCol+" = ?", key).First(redemption).Error
		if err != nil {
			return errors.New("无效的兑换码")
		}
		if redemption.Status != common.RedemptionCodeStatusEnabled {
			return errors.New("该兑换码已被使用")
		}
		if redemption.ExpiredTime != 0 && redemption.ExpiredTime < common.GetTimestamp() {
			return errors.New("该兑换码已过期")
		}
		err = tx.Model(&User{}).Where("id = ?", userId).Update("quota", gorm.Expr("quota + ?", redemption.Quota)).Error
		if err != nil {
			return err
		}
		redemption.RedeemedTime = common.GetTimestamp()
		redemption.Status = common.RedemptionCodeStatusUsed
		redemption.UsedUserId = userId
		err = tx.Save(redemption).Error
		return err
	})
	if err != nil {
		common.SysError("redemption failed: " + err.Error())
		return 0, ErrRedeemFailed
	}
	keyPrefix := redemption.Key
	if len(keyPrefix) > 8 {
		keyPrefix = keyPrefix[:8] + "..."
	}
	RecordTopupLog(userId, redemption.Quota, fmt.Sprintf("通过兑换码充值 %s，兑换码ID %d（%s）", logger.LogQuota(redemption.Quota), redemption.Id, keyPrefix))
	return redemption.Quota, nil
}

func (redemption *Redemption) Insert() error {
	var err error
	err = DB.Create(redemption).Error
	return err
}

func (redemption *Redemption) SelectUpdate() error {
	// This can update zero values
	return DB.Model(redemption).Select("redeemed_time", "status").Updates(redemption).Error
}

// Update Make sure your token's fields is completed, because this will update non-zero values
func (redemption *Redemption) Update() error {
	var err error
	err = DB.Model(redemption).Select("name", "status", "quota", "redeemed_time", "expired_time", "cc_source", "cc_order_id", "cc_refundable", "cc_remark").Updates(redemption).Error
	return err
}

func (redemption *Redemption) Delete() error {
	var err error
	err = DB.Delete(redemption).Error
	return err
}

func DeleteRedemptionById(id int) (err error) {
	if id == 0 {
		return errors.New("id 为空！")
	}
	redemption := Redemption{Id: id}
	err = DB.Where(redemption).First(&redemption).Error
	if err != nil {
		return err
	}
	return redemption.Delete()
}

func DeleteInvalidRedemptions() (int64, error) {
	now := common.GetTimestamp()
	result := DB.Where("status IN ? OR (status = ? AND expired_time != 0 AND expired_time < ?)", []int{common.RedemptionCodeStatusUsed, common.RedemptionCodeStatusDisabled}, common.RedemptionCodeStatusEnabled, now).Delete(&Redemption{})
	return result.RowsAffected, result.Error
}
