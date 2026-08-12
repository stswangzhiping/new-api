package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/mojocn/base64Captcha"
)

var captchaStore = base64Captcha.DefaultMemStore

func GenerateCaptcha(c *gin.Context) {
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

func VerifyCaptchaAnswer(id, answer string) bool {
	if id == "" || answer == "" {
		return false
	}
	return captchaStore.Verify(id, answer, true)
}
