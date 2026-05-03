module example.com/app

go 1.24

// replace example.com/commented => github.com/acme/commented.git main
require (
  example.com/lib v1.2.3
)

replace (
  example.com/floating => github.com/acme/floating.git main
  example.com/pseudo => github.com/acme/pseudo.git v1.2.3-20240202150405-abcdef123456
  example.com/sha => github.com/acme/sha.git 0123456789abcdef0123456789abcdef01234567
)
