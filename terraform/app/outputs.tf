output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_client_id" {
  value = aws_cognito_user_pool_client.main.id
}

output "cognito_domain_url" {
  value = "https://${aws_cognito_user_pool_domain.main.domain}.auth.ap-northeast-1.amazoncognito.com"
}



output "api_endpoint" {
  value = aws_apigatewayv2_stage.default.invoke_url
}

output "amplify_app_id" {
  description = "The ID of the Amplify App"
  value       = aws_amplify_app.frontend.id
}

output "amplify_branch_name" {
  description = "The name of the Amplify Branch"
  value       = aws_amplify_branch.main.branch_name
}

output "amplify_default_domain" {
  description = "The default domain for the Amplify App"
  value       = "https://${aws_amplify_branch.main.branch_name}.${aws_amplify_app.frontend.id}.amplifyapp.com"
}
