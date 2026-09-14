package controller

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

func GetAllLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	username := c.Query("username")
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	requestId := c.Query("request_id")
	upstreamRequestId := c.Query("upstream_request_id")
	logs, total, err := model.GetAllLogs(logType, startTimestamp, endTimestamp, modelName, username, tokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), channel, group, requestId, upstreamRequestId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if c.GetInt("role") < common.RoleRootUser {
		model.FormatAdminLogs(logs)
	} else {
		model.FormatRootLogs(logs)
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
	return
}

type csvLogOther struct {
	Frt                    float64 `json:"frt"`
	CacheTokens            int64   `json:"cache_tokens"`
	CacheCreationTokens    int64   `json:"cache_creation_tokens"`
	CacheCreationTokens5m  int64   `json:"cache_creation_tokens_5m"`
	CacheCreationTokens1h  int64   `json:"cache_creation_tokens_1h"`
}

func getCSVLogUsage(other string) (firstTokenSeconds string, cacheRead int64, cacheWrite int64) {
	var data csvLogOther
	if err := json.Unmarshal([]byte(other), &data); err != nil {
		return "", 0, 0
	}
	if data.Frt > 0 {
		firstTokenSeconds = fmt.Sprintf("%.3f", data.Frt/1000)
	}
	cacheWrite = data.CacheCreationTokens5m + data.CacheCreationTokens1h
	if cacheWrite == 0 {
		cacheWrite = data.CacheCreationTokens
	}
	return firstTokenSeconds, data.CacheTokens, cacheWrite
}

// ExportAllLogs streams a CSV directly from the database. Unlike the list API,
// it does not count all records or use OFFSET pagination for every batch.
func ExportAllLogs(c *gin.Context) {
	exportLogs(c, c.Query("username"))
}

func ExportUserLogs(c *gin.Context) {
	exportLogs(c, c.GetString("username"))
}

func exportLogs(c *gin.Context, username string) {
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	requestId := c.Query("request_id")
	upstreamRequestId := c.Query("upstream_request_id")

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=usage-logs-%s.csv", time.Now().Format("2006-01-02")))
	c.Header("X-Content-Type-Options", "nosniff")
	c.Status(http.StatusOK)
	c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})

	writer := csv.NewWriter(c.Writer)
	if err := writer.Write([]string{"时间", "用户名", "令牌名称", "分组", "类型", "模型名称", "耗时", "首字响应时间", "输入", "缓存读", "缓存写", "输出", "额度", "IP", "详情"}); err != nil {
		return
	}

	shanghai := time.FixedZone("CST", 8*60*60)
	rows := 0
	err := model.StreamAllLogs(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel, group, requestId, upstreamRequestId, func(log *model.Log) error {
		firstToken, cacheRead, cacheWrite := getCSVLogUsage(log.Other)
		useTime := ""
		if log.Type == 2 || log.Type == 5 {
			useTime = strconv.Itoa(log.UseTime)
		}
		if err := writer.Write([]string{
			time.Unix(log.CreatedAt, 0).In(shanghai).Format("2006-01-02 15:04:05"),
			log.Username,
			log.TokenName,
			log.Group,
			strconv.Itoa(log.Type),
			log.ModelName,
			useTime,
			firstToken,
			strconv.Itoa(log.PromptTokens),
			strconv.FormatInt(cacheRead, 10),
			strconv.FormatInt(cacheWrite, 10),
			strconv.Itoa(log.CompletionTokens),
			strconv.Itoa(log.Quota),
			log.Ip,
			log.Content,
		}); err != nil {
			return err
		}
		rows++
		if rows%1000 == 0 {
			writer.Flush()
			if err := writer.Error(); err != nil {
				return err
			}
			c.Writer.Flush()
		}
		return nil
	})
	writer.Flush()
	if err != nil {
		_ = c.Error(err)
	}
}

func GetUserLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	userId := c.GetInt("id")
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	group := c.Query("group")
	requestId := c.Query("request_id")
	upstreamRequestId := c.Query("upstream_request_id")
	logs, total, err := model.GetUserLogs(userId, logType, startTimestamp, endTimestamp, modelName, tokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), group, requestId, upstreamRequestId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
	return
}

// Deprecated: SearchAllLogs 已废弃，前端未使用该接口。
func SearchAllLogs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": "该接口已废弃",
	})
}

// Deprecated: SearchUserLogs 已废弃，前端未使用该接口。
func SearchUserLogs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": "该接口已废弃",
	})
}

func GetLogByKey(c *gin.Context) {
	tokenId := c.GetInt("token_id")
	if tokenId == 0 {
		c.JSON(200, gin.H{
			"success": false,
			"message": "无效的令牌",
		})
		return
	}
	logs, err := model.GetLogByTokenId(tokenId)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data":    logs,
	})
}

func GetLogsStat(c *gin.Context) {
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	username := c.Query("username")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	stat, err := model.SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel, group)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, "")
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": stat.Quota,
			"rpm":   stat.Rpm,
			"tpm":   stat.Tpm,
		},
	})
	return
}

func GetLogsSelfStat(c *gin.Context) {
	username := c.GetString("username")
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	quotaNum, err := model.SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel, group)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, tokenName)
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": quotaNum.Quota,
			"rpm":   quotaNum.Rpm,
			"tpm":   quotaNum.Tpm,
			//"token": tokenNum,
		},
	})
	return
}
