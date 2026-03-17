/**
 * 测试城市坐标预加载功能
 * 
 * 使用方法：
 * npx tsx tools/test-city-coordinates.ts
 */

import * as path from 'path';
import * as fs from 'fs/promises';

interface CityCoordinate {
  name: string;
  nameZh: string;
  lat: number;
  lon: number;
  country: string;
  state: string;
}

async function testCityCoordinates() {
  console.log('=== 城市坐标预加载功能测试 ===\n');

  try {
    // 查找项目根目录
    let currentPath = process.cwd();
    let projectRoot = currentPath;

    while (currentPath !== path.parse(currentPath).root) {
      const parentDir = path.dirname(currentPath);
      if (path.basename(parentDir) === 'packages' &&
          path.basename(currentPath) === 'server') {
        projectRoot = path.dirname(parentDir);
        break;
      }
      currentPath = parentDir;
    }

    const cityCoordsPath = path.join(projectRoot, '.mcp', 'city-coordinates.json');
    console.log(`配置文件路径: ${cityCoordsPath}\n`);

    // 读取配置文件
    const configContent = await fs.readFile(cityCoordsPath, 'utf-8');
    const config = JSON.parse(configContent);

    console.log(`✓ 成功读取配置文件`);
    console.log(`  描述: ${config.description}`);
    console.log(`  城市数量: ${Object.keys(config.cities).length}\n`);

    // 测试数据结构
    console.log('--- 测试数据结构 ---');
    const firstCity = Object.values(config.cities)[0] as CityCoordinate;
    console.log(`✓ 第一个城市: ${firstCity.name} (${firstCity.nameZh})`);
    console.log(`  坐标: ${firstCity.lat}, ${firstCity.lon}`);
    console.log(`  国家: ${firstCity.country}, 州/省: ${firstCity.state}\n`);

    // 测试中文城市查找
    console.log('--- 测试中文城市查找 ---');
    const testCities = ['北京', '上海', '广州', '深圳', '杭州'];
    for (const cityName of testCities) {
      const city = config.cities[cityName] as CityCoordinate;
      if (city) {
        console.log(`✓ ${cityName}: ${city.lat}, ${city.lon}`);
      } else {
        console.log(`✗ ${cityName}: 未找到`);
      }
    }
    console.log('');

    // 测试英文城市查找
    console.log('--- 测试英文城市查找 ---');
    const testCitiesEn = ['New York', 'London', 'Tokyo', 'Paris', 'Sydney'];
    for (const cityName of testCitiesEn) {
      const city = config.cities[cityName] as CityCoordinate;
      if (city) {
        console.log(`✓ ${cityName}: ${city.lat}, ${city.lon}`);
      } else {
        console.log(`✗ ${cityName}: 未找到`);
      }
    }
    console.log('');

    // 测试模糊搜索
    console.log('--- 测试模糊搜索 ---');
    const searchQueries = ['京', '州', 'on'];
    for (const query of searchQueries) {
      const results = Object.values(config.cities).filter((city: any) =>
        city.name.toLowerCase().includes(query.toLowerCase()) ||
        city.nameZh.includes(query)
      );
      console.log(`✓ 搜索 "${query}": 找到 ${results.length} 个城市`);
      if (results.length > 0) {
        console.log(`  结果: ${results.map((c: any) => c.nameZh || c.name).join(', ')}`);
      }
    }
    console.log('');

    // 统计国家分布
    console.log('--- 统计国家分布 ---');
    const countryStats = new Map<string, number>();
    for (const city of Object.values(config.cities) as CityCoordinate[]) {
      const count = countryStats.get(city.country) || 0;
      countryStats.set(city.country, count + 1);
    }
    for (const [country, count] of countryStats.entries()) {
      console.log(`✓ ${country}: ${count} 个城市`);
    }
    console.log('');

    console.log('=== 所有测试通过 ✓ ===');

  } catch (error) {
    console.error('\n✗ 测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
testCityCoordinates();
