package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/mojocn/base64Captcha"
)

var captchaStore = base64Captcha.DefaultMemStore

// GenerateCaptcha generates a digit captcha and returns id + base64 image.
func GenerateCaptcha(c *gin.Context) {
	// 6-digit captcha, 80x240 image
	driver := base64Captcha.NewDriverDigit(80, 240, 6, 0.7, 80)
	cp := base64Captcha.NewCaptcha(driver, captchaStore)
	id, b64s, _, err := cp.Generate()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"captcha_id":  id,
		"captcha_img": b64s,
	})
}

// VerifyCaptchaAnswer checks captcha_id + captcha_answer query params.
// Returns true and clears the captcha if valid.
func VerifyCaptchaAnswer(id, answer string) bool {
	if id == "" || answer == "" {
		return false
	}
	return captchaStore.Verify(id, answer, true)
}
