package model

import (
	"time"

	"gorm.io/gorm"
)

const (
	CapabilityOperator = "operator" // 运营：IN + OUT 域
	CapabilityFinance  = "finance"  // 财务：BALANCE 域
	CapabilityAdmin    = "admin"    // 全功能：沿用 new-api 原生 admin 定义
)

var ValidCapabilities = map[string]bool{
	CapabilityOperator: true,
	CapabilityFinance:  true,
	CapabilityAdmin:    true,
}

// AdminCapability 记录管理员的能力域授权。
// user_id + capability 联合唯一，软删除保留审计轨迹。
type AdminCapability struct {
	ID         uint           `json:"id" gorm:"primarykey;autoIncrement"`
	UserID     int            `json:"user_id" gorm:"uniqueIndex:uq_admin_cap;not null"`
	Capability string         `json:"capability" gorm:"type:varchar(32);uniqueIndex:uq_admin_cap;not null"`
	GrantedBy  int            `json:"granted_by"`
	GrantedAt  time.Time      `json:"granted_at" gorm:"autoCreateTime"`
	DeletedAt  gorm.DeletedAt `json:"deleted_at,omitempty" gorm:"index"`
}

// GetAdminCapabilities 返回用户持有的所有 capability 名称列表。
func GetAdminCapabilities(userID int) ([]string, error) {
	var caps []AdminCapability
	if err := DB.Where("user_id = ?", userID).Find(&caps).Error; err != nil {
		return nil, err
	}
	result := make([]string, 0, len(caps))
	for _, c := range caps {
		result = append(result, c.Capability)
	}
	return result, nil
}

// HasAdminCapability 检查用户是否持有指定 capability。
func HasAdminCapability(userID int, capability string) bool {
	var count int64
	DB.Model(&AdminCapability{}).
		Where("user_id = ? AND capability = ?", userID, capability).
		Count(&count)
	return count > 0
}

// SetAdminCapabilities 用事务替换用户的全部 capability（先清除再插入）。
func SetAdminCapabilities(userID int, capabilities []string, grantedBy int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Unscoped().Where("user_id = ?", userID).Delete(&AdminCapability{}).Error; err != nil {
			return err
		}
		for _, cap := range capabilities {
			if !ValidCapabilities[cap] {
				continue
			}
			record := AdminCapability{
				UserID:     userID,
				Capability: cap,
				GrantedBy:  grantedBy,
			}
			if err := tx.Create(&record).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
