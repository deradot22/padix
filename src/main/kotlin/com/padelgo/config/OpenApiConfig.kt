package com.padelgo.config

import io.swagger.v3.oas.models.Components
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.info.Info
import io.swagger.v3.oas.models.security.SecurityRequirement
import io.swagger.v3.oas.models.security.SecurityScheme
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class OpenApiConfig {
    @Bean
    fun openApi(): OpenAPI = OpenAPI()
        .info(
            Info()
                .title("Padix API")
                .version("1.0")
                .description(
                    """
                    REST API для мобильного приложения Padix (падел-теннис).

                    ## Аутентификация
                    1. `POST /api/auth/register` — регистрация
                    2. `POST /api/auth/login` — вход, получаешь `token`
                    3. Все защищённые эндпоинты требуют заголовок: `Authorization: Bearer <token>`

                    В Swagger UI нажми **Authorize** вверху и вставь токен.
                    """.trimIndent()
                )
        )
        .addSecurityItem(SecurityRequirement().addList("BearerAuth"))
        .components(
            Components().addSecuritySchemes(
                "BearerAuth",
                SecurityScheme()
                    .name("BearerAuth")
                    .type(SecurityScheme.Type.HTTP)
                    .scheme("bearer")
                    .bearerFormat("JWT")
                    .description("JWT токен из /api/auth/login → поле token")
            )
        )
}
