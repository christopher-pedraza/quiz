import {
    Card,
    CardHeader,
    CardBody,
    CardFooter,
    Button,
} from "@nextui-org/react";
import Question from "./components/Question/Question";

import { useState, useEffect } from "react";
import questionsData from "../../exams_questions/questions_data.json";

function Exam() {
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answeredQuestions, setAnsweredQuestions] = useState([]);

    useEffect(() => {
        setQuestions(questionsData);
    }, []);

    const nextQuestion = () => {
        const newAnsweredQuestions = [
            ...answeredQuestions,
            currentQuestionIndex,
        ];
        setAnsweredQuestions(newAnsweredQuestions);
        const remainingQuestions = questions.filter(
            (_, index) => !newAnsweredQuestions.includes(index)
        );
        if (remainingQuestions.length > 0) {
            const nextIndex = questions.indexOf(
                remainingQuestions[
                    Math.floor(Math.random() * remainingQuestions.length)
                ]
            );
            setCurrentQuestionIndex(nextIndex);
        } else {
            alert("No more questions available.");
        }
    };

    return (
        <>
            {questions.length > 0 && (
                <Question
                    question_data={questions[currentQuestionIndex]}
                    nextQuestion={nextQuestion}
                />
            )}
        </>
    );
}

export default Exam;
