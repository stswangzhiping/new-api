package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// GetAdminCapabilities GET /api/capability/:userId
// 查询某管理员的 capability 列表（root 专用）。
func GetAdminCapabilities(c *gin.Context) {
	userID, err := strconv.Atoi(c.Param("userId"))
	if err != nil || userID <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效的用户 ID"})
		return
	}
	caps, err := model.GetAdminCapabilities(userID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": caps})
}

// SetAdminCapabilities PUT /api/capability/:userId
// Body: {"capabilities": ["operator", "finance"]}
// 替换某管理员的全部 capability（root 专用）。
func SetAdminCapabilities(c *gin.Context) {
	userID, err := strconv.Atoi(c.Param("userId"))
	if err != nil || userID <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效的用户 ID"})
		return
	}

	var body struct {
		Capabilities []string `json:"capabilities"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "请求体解析失败"})
		return
	}

	grantedBy := c.GetInt("id")
	if err := model.SetAdminCapabilities(userID, body.Capabilities, grantedBy); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}
