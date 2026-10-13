FROM node:24-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend
WORKDIR /src
COPY backend/RoomRental.Api/RoomRental.Api.csproj backend/RoomRental.Api/
RUN dotnet restore backend/RoomRental.Api/RoomRental.Api.csproj
COPY backend/ backend/
RUN dotnet publish backend/RoomRental.Api/RoomRental.Api.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=backend /out/ ./
COPY --from=frontend /src/frontend/dist/ ./wwwroot/
RUN mkdir -p /app/data/keys && chown -R app:app /app/data
USER app
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "RoomRental.Api.dll"]

