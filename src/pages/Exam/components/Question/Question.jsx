import {
    Card,
    CardHeader,
    CardBody,
    CardFooter,
    Button,
    CheckboxGroup,
    Checkbox,
} from "@nextui-org/react";

import { useState } from "react";

function Question({ question_data }) {
    const { question, answers, explanation, images } = question_data;
    const [selectedAnswers, setSelectedAnswers] = useState([]);
    const [showAnswerStatus, setShowAnswerStatus] = useState(false);

    const checkAnswers = () => {
        setShowAnswerStatus(true);
    };

    const onAnswerChange = (newSelectedValues) => {
        setShowAnswerStatus(false);
        setSelectedAnswers(newSelectedValues);
    };

    return (
        <>
            <Card>
                <CardBody>
                    <p>
                        <strong>{question}</strong>
                    </p>
                    <CheckboxGroup onValueChange={onAnswerChange}>
                        {answers.map((answer, index) => (
                            <Checkbox key={index} value={index}>
                                {showAnswerStatus &&
                                selectedAnswers.includes(index) ? (
                                    answer.is_correct ? (
                                        <span className="text-green-500">
                                            {answer.answer}
                                        </span>
                                    ) : (
                                        <span className="text-red-500">
                                            {answer.answer}
                                        </span>
                                    )
                                ) : (
                                    answer.answer
                                )}
                            </Checkbox>
                        ))}
                    </CheckboxGroup>
                </CardBody>
            </Card>
            <Button onPress={checkAnswers}>Checar</Button>
        </>
    );
}

export default Question;
