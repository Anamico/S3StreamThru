local value = redis.call("get", KEYS[1])
if value == false then
  redis.call("setex", KEYS[1], 60, "")
  return 'NEW'
end
return value
