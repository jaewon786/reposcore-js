import path from 'path';
import fs from 'fs/promises';
import Table from 'cli-table3';

import { getBadge, log } from './Util.js';

export default class TableGenerator {
    constructor(themeManager) {
        this.themeManager = themeManager;
    }

    async generateTable(allRepoScores, output) {
        const promises = Array.from(allRepoScores).map(async ([repoName, repoScores]) => {
            let theme = this.themeManager.getCurrentTheme();
            
            // 테마 null 체크
            if (!theme || !theme.table) {
                console.error('테이블 테마를 불러올 수 없습니다. 기본 설정을 사용합니다.');
                theme = {
                    table: {
                        head: ['yellow'],
                        border: ['gray']
                    }
                };
            }

            // 한국어와 이모지의 실제 표시 너비 계산 함수
            const calculateDisplayWidth = (str) => {
                let width = 0;
                for (const char of str) {
                    // 한국어: 2바이트로 계산
                    if (/[\u3131-\uD79D]/.test(char)) {
                        width += 2;
                    }
                    // 이모지: 2바이트로 계산 (터미널마다 다를 수 있지만 기본적으로 2로 가정)
                    else if (/[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(char)) {
                        width += 2;
                    }
                    // 그 외 ASCII 문자: 1바이트
                    else {
                        width += 1;
                    }
                }
                return width;
            };

            // 참가자의 최대 너비 계산
            let maxNameWidth = 20; // 최소 너비
            repoScores.forEach(([name, , , , , , total]) => {
                // 뱃지
                const badge = getBadge(total);
                // 뱃지에서 이모지만 추출
                const badgeEmoji = badge.split(' ')[0];
                const nameWithBadge = `${badgeEmoji} ${name}`;
                const displayWidth = calculateDisplayWidth(nameWithBadge);
                maxNameWidth = Math.max(maxNameWidth, displayWidth + 2); // 여유 공간 추가
            });

            // 순위 계산 함수
            function calculateRank(currentIndex, currentTotal, prevTotal, prevRank) {
                return currentTotal === prevTotal ? prevRank : currentIndex + 1;
            }
            // 참여율 계산 함수
            function calculateRate(score, totalScore) {
                return totalScore > 0 ? ((score / totalScore) * 100).toFixed(2) : '0.00';
            }
            // 동적 colWidths 설정
            const colWidths = [
                6,            //순위
                maxNameWidth, // 참가자 열 (동적)
                16,           // feat/bug PR 점수
                12,           // doc PR 점수
                12,           // typo PR 점수
                16,           // feat/bug 이슈 점수
                12,           // doc 이슈 점수
                10,           // 총점
                11            // 참여율(%)
            ];

            const table = new Table({
                head: ['순위', '참가자', 'feat/bug PR 점수', 'doc PR 점수', 'typo PR 점수', 'feat/bug 이슈 점수', 'doc 이슈 점수', '총점', '참여율(%)'],
                colWidths: colWidths,
                style: { 
                    head: theme.table.head,
                    border: theme.table.border
                },
                wordWrap: true // 긴 텍스트 자동 줄바꿈
            });

            // 리포지토리 전체 합(= 모든 기여자의 totalScore 합)
            const totalScore = repoScores.reduce((sum, row) => sum + row[6], 0); // 변경: totalScore 인덱스 6으로 조정

            // 텍스트 파일로 저장하기 위해 문자열 준비
            let prevTotal = null;
            let rank = 0;
            repoScores.forEach(([name, p_fb_score, p_d_score, p_t_score, i_fb_score, i_d_score, total], index) => { // 변경: p_t_score 추가
                // 순위 계산
                rank = calculateRank(index, total, prevTotal, rank);
                prevTotal = total;

                // 참여율 계산
                const rate = calculateRate(total, totalScore);

                //뱃지
                const badge = getBadge(total);
                
                // 뱃지에서 이모지만 추출
                const badgeEmoji = badge.split(' ')[0];
                const nameWithBadge = `${badgeEmoji} ${name}`;

                // CLI에 표시될 테이블 행
                table.push([
                    rank,
                    nameWithBadge,
                    p_fb_score,
                    p_d_score,
                    p_t_score, // 추가
                    i_fb_score,
                    i_d_score,
                    total,
                    `${rate}%`
                ]);
            });

            const repoSpecificDir = path.join(output, repoName);
            await fs.mkdir(repoSpecificDir, { recursive: true });
            const filePath = path.join(repoSpecificDir, `${repoName}.txt`);

            const now = new Date();
            const dateStr = now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' });

            const headerTextLines = [
                'Contribution Score by Participant',
                `Generated at ${dateStr}`,
                '' // 줄바꿈 한 줄 추가
            ];
            const headerText = headerTextLines.join('\n');

            // 테이블 문자열
            const tableString = table.toString();
            
            // ANSI 색상 코드를 제거한 텍스트를 저장
            // 정규식을 사용하여 ANSI 이스케이프 시퀀스 제거
            const stripAnsi = (str) => {
                // ANSI 이스케이프 시퀀스 제거 정규식
                return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
            };

            // 최종 출력 문자열: 헤더 + 테이블
            const finalOutput = headerText + tableString;

            // 파일로 저장
            await fs.writeFile(filePath, stripAnsi(finalOutput), 'utf-8');
            log(`점수 집계 텍스트 파일이 생성되었습니다: ${filePath}`, 'INFO');
        });

        await Promise.all(promises);
    }
}